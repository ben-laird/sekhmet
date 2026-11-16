# Panic runtime guide

This guide covers the panic runtime in `@sekhmet/panic`: what a runtime is, how
its hook reports, how its boundaries recover, and the rules that keep each
panic reported once per runtime.

## One runtime per program

There is no global hook and no default runtime. Create a runtime where your
program starts and run everything inside it:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Ok } from "@sekhmet/enum/result/mini/core";
import { assertEquals } from "@std/assert";

const main = (): number => 0;

const runtime = definePanicRuntime();
const exit = runtime.catchUnwind(main);

assertEquals(exit, Ok(0));
```

Runtimes are independent. A hook set on one runtime never sees a panic that
only another runtime catches, so tests can each create their own runtime
without interfering.

## Reporting: the hook

A hook is a function that receives a `PanicHookInfo` and returns nothing:

- `payload`: the thrown value, unchanged.
- `stack`: the payload's stack when it is an `Error` (a `Panic` included),
  otherwise `undefined`.

A new runtime starts with `defaultPanicHook`, which writes a report to
`console.error`. For an `Error` payload (a `Panic` included) the report is
`panicked: <name>: <message>`, then the stack frames; the header comes from
the payload, so it reads the same on every engine (V8, Bun, Firefox, WebKit).
Any other payload prints as `panicked: …` with the value. Replace the hook
with `setHook`. To add to a hook
instead of replacing it, take the current one with `takeHook` and call it from
the new hook, as in Rust:

```ts
import { definePanicRuntime, panic } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const order: string[] = [];
runtime.setHook(() => order.push("reporter")); // stands in for a real reporter

const previous = runtime.takeHook();
runtime.setHook((info) => {
	order.push("telemetry");
	previous(info);
});

runtime.catchUnwind(() => panic({ message: "bad state", cause: null }));

assertEquals(order, ["telemetry", "reporter"]);
```

`takeHook` returns the installed hook and puts `defaultPanicHook` back.

The hook reports; it never decides the outcome. Turning a payload into an app
error is the caller's job, through `mapErr` on the returned `Result`.

## Recovery: boundaries

`catchUnwind(fn)` runs `fn` and returns `Ok` of its value, or `Err` of
whatever it threw. `catchUnwindAsync(fn)` does the same for a function that
returns a promise, catching both a rejection and a synchronous throw, so it
never leaves an unhandled rejection.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { mapErr } from "@sekhmet/enum/result/mini/transform";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

const loadConfig = async (): Promise<string> =>
	panic({ name: "Config", message: "missing port", cause: null });

const result = mapErr(
	await runtime.catchUnwindAsync(() => loadConfig()),
	(payload) =>
		payload instanceof Panic
			? { kind: "panic", name: payload.name }
			: { kind: "unknown" },
);

assertEquals(unwrapErr(result), { kind: "panic", name: "Panic (Config)" });
```

`catchUnwindAsync` accepts any `PromiseLike`, so thenables work too. Passing a
promise-returning function to `catchUnwind` is a type error naming
`useCatchUnwindAsyncForPromises`: that boundary would return the promise
itself as an `Ok` value and miss its rejection.

## Reported once per runtime

Each runtime holds a private record (a `WeakSet`) of the object payloads it
has reported. The hook runs at the runtime's **innermost boundary that
catches** an unwind; that boundary records the payload, and every other
boundary of the same runtime skips the hook for it. The payload itself is
never touched.

The record belongs to the runtime, so reporting is per runtime. A payload that
passes through a library's runtime and then yours is reported once by each,
through each runtime's own hook. A library can never silence your hook, and
two copies of this package simply act as two runtimes.

To pass a caught payload on to an outer boundary, use `resumeUnwind`. It
re-throws the payload unchanged, never reports it, and records it, so no
boundary of the same runtime reports it afterwards:

```ts
import { definePanicRuntime, panic } from "@sekhmet/panic";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
let reports = 0;
runtime.setHook(() => reports++);

const recoverable = (_payload: unknown): boolean => false;
const step = (): number => panic({ message: "bad state", cause: null });

const outer = runtime.catchUnwind(() => {
	const inner = runtime.catchUnwind(step);
	if (isErr(inner) && !recoverable(unwrapErr(inner))) {
		runtime.resumeUnwind(unwrapErr(inner));
	}
	return inner;
});

assertEquals([isErr(outer), reports], [true, 1]);
```

Primitives (strings, numbers, `undefined` and so on) can't go in a `WeakSet`.
Recording them in a `Set` instead would leak, and worse, would silence every
later throw of an equal value, which is a different unwind. So every boundary
that catches a primitive reports it, even after `resumeUnwind`: a duplicate
report is safer than a lost one. Throw a `Panic` (or another `Error`) to get
the once-only guarantee.

## When the hook throws

Rust aborts the process when a panic hook panics. JavaScript has no portable
abort, so the boundary instead stops recovering: it throws a new `Panic` named
`Panic (PanicHook)`, whose cause is `{ payload, thrown }`. The runtime still
records the original payload as reported. An outer boundary then reports and
catches the `Panic (PanicHook)` like any other unwind; with no outer boundary,
the host reports it as an uncaught error.

To recognize it, use `isPanicHookFailure(payload)`. It narrows the payload to
`Panic<PanicHookFailure>`, so `payload.cause.payload` and
`payload.cause.thrown` need no cast. It accepts only the panic a boundary
threw, never a `Panic` built by hand with the same name.
