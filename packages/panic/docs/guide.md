# Panic runtime guide

This guide covers the panic runtime in `@sekhmet/panic`: what a runtime is, how
its hook reports, how its boundaries recover, and the rules that keep each
panic reported exactly once.

## One runtime per program

There is no global hook and no default runtime. Create a runtime where your
program starts and run everything inside it:

```ts ignore
import { definePanicRuntime } from "@sekhmet/panic";

const runtime = definePanicRuntime();
const exit = runtime.catchUnwind(main);
```

Runtimes are independent. A hook set on one runtime never sees another
runtime's panics, so tests can each create their own runtime without
interfering.

## Reporting: the hook

A hook is a function that receives a `PanicHookInfo` and returns nothing:

- `payload`: the thrown value, unchanged.
- `stack`: the payload's stack when it is an `Error` (a `Panic` included),
  otherwise `undefined`.

A new runtime starts with `defaultPanicHook`, which writes `panicked: …` and
the stack to `console.error`. Replace it with `setHook`. To add to a hook
instead of replacing it, take the current one with `takeHook` and call it from
the new hook, as in Rust:

```ts ignore
const previous = runtime.takeHook();
runtime.setHook((info) => {
	telemetry.record(info.payload);
	previous(info);
});
```

`takeHook` returns the installed hook and puts `defaultPanicHook` back.

The hook reports; it never decides the outcome. Turning a payload into an app
error is the caller's job, through `mapErr` on the returned `Result`.

## Recovery: boundaries

`catchUnwind(fn)` runs `fn` and returns `Ok` of its value, or `Err` of
whatever it threw. `catchUnwindAsync(fn)` does the same for a function that
returns a promise, catching both a rejection and a synchronous throw, so it
never leaves an unhandled rejection.

```ts ignore
import { Panic } from "@sekhmet/panic";
import { mapErr } from "@sekhmet/enum/result/mini/transform";

const result = mapErr(
	await runtime.catchUnwindAsync(() => loadConfig()),
	(payload) =>
		payload instanceof Panic
			? { kind: "panic", id: payload.id }
			: { kind: "unknown" },
);
```

Pass a promise-returning function to `catchUnwindAsync`, not `catchUnwind`;
`catchUnwind` would return the promise itself as an `Ok` value.

## Reported once

The hook runs at the **innermost boundary that catches** an unwind. That
boundary marks the payload as reported, and every other boundary, in this
runtime or any other, skips the hook for a marked payload.

To pass a caught payload on to an outer boundary, use `resumeUnwind`. It
re-throws the payload unchanged and never reports it:

```ts ignore
const inner = runtime.catchUnwind(step);
if (isErr(inner) && !recoverable(unwrapErr(inner))) {
	runtime.resumeUnwind(unwrapErr(inner));
}
```

The mark lives on the payload, so only objects that can take a new property
carry it. Primitives (strings, numbers, `undefined` and so on) and frozen,
sealed or otherwise non-extensible objects cannot, and are reported by every
boundary that catches them. Throw a `Panic` (or another `Error`) to get the
once-only guarantee.

## When the hook throws

Rust aborts the process when a panic hook panics. JavaScript has no portable
abort, so the boundary instead stops recovering: it throws a new `Panic` named
`Panic (PanicHook)`, whose cause is `{ payload, thrown }`. The original payload
is marked as reported. An outer boundary then reports and catches the
`Panic (PanicHook)` like any other unwind; with no outer boundary, the host
reports it as an uncaught error.
