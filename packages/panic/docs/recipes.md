---
kind: how-to
---

# Recipes

How-to guides for putting a panic runtime to work. For every export, see the
[API reference](https://jsr.io/@sekhmet/panic/doc); for why the runtime works
the way it does, see the [concepts](./concepts.md).

## How to run a program inside a runtime

There is no default runtime, so create one where your program starts and run
everything inside its boundary.

1. Call `definePanicRuntime()` once, at the entry point.
2. Run the program's main function with `runtime.catchUnwind`, sync or
   async: it hands back a `Vow` of an `Outcome`.
3. Read the `Outcome`: `Ok` holds what the program returned, `Panicked` what
   it threw. A sync program settles the vow before `catchUnwind` returns, so
   read it with `poll` and `expectReady`; wait for an async one with `wait`.

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { Ok } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const main = (): number => 0;

const runtime = definePanicRuntime();
const exit = expectReady(poll(runtime.catchUnwind(main)), "main is sync");

assertEquals(exit, Ok(0));
```

A function that returns a promise or another thenable is adopted, as
`await` adopts it, so its rejection is `Panicked` too; see
[how to recover from async work](#how-to-recover-from-async-work).

## How to report panics to a logger

A runtime starts with `defaultPanicHook`, which writes each report to
`console.error`. To send reports somewhere else, replace the hook with
`setHook`.

1. Write a hook: a function that takes a `PanicHookInfo` and returns nothing.
   Its `payload` is the thrown value, unchanged; its `stack` is the payload's
   stack when the payload is an `Error`, otherwise `undefined`.
2. Install it with `runtime.setHook(hook)`.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

interface LogEntry {
	level: "fatal";
	message: string;
	hasStack: boolean;
}

const log: LogEntry[] = []; // stands in for a real logger

const runtime = definePanicRuntime();
runtime.setHook(({ payload, stack }) => {
	log.push({
		level: "fatal",
		message: payload instanceof Panic ? payload.message : String(payload),
		hasStack: stack !== undefined,
	});
});

runtime.catchUnwind(() => panic({ message: "bad state", cause: null }));
runtime.catchUnwind(() => {
	throw "not an Error";
});

assertEquals(log, [
	{ level: "fatal", message: "bad state", hasStack: true },
	{ level: "fatal", message: "not an Error", hasStack: false },
]);
```

Keep the hook to reporting. If it throws, the boundary stops recovering; see
[how to recognize a hook that failed](#how-to-recognize-a-hook-that-failed).

## How to add to the current hook

To add a reporter without losing the one already installed, chain them, as in
Rust:

1. Take the installed hook with `runtime.takeHook()`. It returns the hook and
   puts `defaultPanicHook` back.
2. Set a new hook that does its own work, then calls the one you took.

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

## How to turn a panic into an app error

A boundary hands back `Panicked` of whatever was thrown, typed `unknown`,
since it catches every throw, not only `Panic`s. Convert it on the returned
`Outcome`:

1. Run the work in `catchUnwind`.
2. Recover with `recover`, narrowing the payload with `instanceof Panic` and
   returning the app error as a `Result`. The panic becomes that `Err`, as
   the `Right` of an `Either` that keeps it apart from the outcome's own
   errors (`Left`), and the `Outcome` left has no panic in it.
3. A boundary has no errors of its own, so `intoInner` reads the app error
   out of the `Either`, and `intoResult` turns the `Outcome` into a
   `Result`.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { Err } from "@sekhmet/enum/result/mini/core";
import { intoInner } from "@sekhmet/enum/either/mini";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { intoResult, mapErr, recover } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

function main(): number {
	panic({ message: "config is missing a port", cause: null });
}

const exit = expectReady(poll(runtime.catchUnwind(main)), "main is sync");
const recovered = recover(exit, (payload) => {
	return Err(payload instanceof Panic ? payload.message : "unknown failure");
});

const result = intoResult(mapErr(recovered, intoInner));

assertEquals(result, Err("config is missing a port"));
```

## How to recover from async work

`catchUnwind` adopts a returned promise, or any other thenable, as `await`
does. It catches a rejection, a `then` that throws and a synchronous throw
from the function alike, so it never leaves an unhandled rejection. Wait for
the vow with `wait` from `@sekhmet/vow`; until it settles, `poll` reads it as
`Pending`.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { mapPanic, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

async function loadConfig(): Promise<string> {
	panic({ name: "Config", message: "missing port", cause: null });
}

const result = mapPanic(
	await wait(runtime.catchUnwind(() => loadConfig())),
	(payload) => {
		if (payload instanceof Panic) {
			return { kind: "panic", name: payload.name };
		}
		return { kind: "unknown" };
	},
);

assertEquals(unwrapPanicked(result), { kind: "panic", name: "Panic (Config)" });
```

Two things follow from adopting a thenable:

- **A thenable returned as data is flattened.** A sync function whose value
  happens to be a promise is waited for, not handed back. Box it to keep it:
  `catchUnwind(() => ({ pending }))`.
- **An expected failure is classified at the edge.** A rejection is always
  `Panicked`, since throw means panic. When a rejection is an expected
  failure, turn it into a `Result` first (`promise.then(Ok, Err)`), then
  flatten what the boundary caught with `fromCaught`:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Err as ResultErr, Ok as ResultOk } from "@sekhmet/enum/result/mini";
import { Err, fromCaught } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const fetchUser = (): Promise<string> => Promise.reject("offline");

const caught = await wait(
	runtime.catchUnwind(() => {
		return fetchUser().then(
			ResultOk<string, string>,
			ResultErr<string, string>,
		);
	}),
);

assertEquals(fromCaught(caught), Err("offline"));
```

If the hook throws while reporting a rejection, there is no caller to throw
the `Panic (PanicHook)` to, and a vow cannot reject: the vow still settles as
`Panicked`, and the `Panic (PanicHook)` escapes as an unhandled rejection; see
[when the hook throws](./concepts.md#when-the-hook-throws).

## How to pass a panic on to an outer boundary

An inner boundary may catch a payload it can't recover from. Pass it on with
`resumeUnwind`, which re-throws the payload unchanged without reporting it
again:

1. Catch the work in an inner `catchUnwind`.
2. If you can't recover, call `runtime.resumeUnwind(payload)`.
3. The outer boundary catches it; its hook was already called once, by the
   inner boundary, and is not called again.

```ts
import { definePanicRuntime, panic } from "@sekhmet/panic";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { isPanicked, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
let reports = 0;
runtime.setHook(() => reports++);

const recoverable = (_payload: unknown): boolean => false;
const step = (): number => panic({ message: "bad state", cause: null });

const outer = runtime.catchUnwind(() => {
	const inner = expectReady(poll(runtime.catchUnwind(step)), "step is sync");
	if (isPanicked(inner) && !recoverable(unwrapPanicked(inner))) {
		runtime.resumeUnwind(unwrapPanicked(inner));
	}
	return inner;
});
const exit = expectReady(poll(outer), "the outer work is sync");

assertEquals([isPanicked(exit), reports], [true, 1]);
```

This holds for object payloads, such as a `Panic`. A thrown primitive is
reported again by every boundary that catches it; see
[why primitives are reported every time](./concepts.md#why-primitives-are-reported-every-time).

## How to attach a cause

Give `panic` a `cause` to carry the data behind a broken invariant, and a
`name` to categorize it. The cause keeps its type, and `check` narrows it
when the cause is a union. With nothing to attach, use `panicWithoutCause`,
whose cause is `null`.

```ts
import { Panic, panic, panicWithoutCause } from "@sekhmet/panic";
import { assert, assertEquals, assertThrows } from "@std/assert";

type Cause = { type: "network"; code: number } | { type: "disk" };
const isNetwork = (c: Cause): c is { type: "network"; code: number } => {
	return c.type === "network";
};

function writeBlock(): never {
	panic<Cause>({
		name: "Storage",
		message: "write failed",
		cause: { type: "network", code: 503 },
	});
}

const thrown = assertThrows(writeBlock, Panic<Cause>);

assertEquals(thrown.name, "Panic (Storage)");
assert(thrown.check(isNetwork));
assertEquals(thrown.cause.code, 503);

const bare = assertThrows(
	() => panicWithoutCause({ message: "unexpected state" }),
	Panic,
);
assertEquals(bare.cause, null);
```

## How to keep your own metadata about panics

To record what your program knows about a panic, such as which part of it
handled the panic, store that metadata in a `PanicMetadataRegistry`. It keys
each entry by the panic's unique `id`:

1. Create the registry with a function that builds the metadata for a panic.
2. In the hook, call `registry.getOrInsert(payload)` for each `Panic`.
3. Read it back with `get`, `has` or by iterating the registry.

```ts
import {
	definePanicRuntime,
	Panic,
	panic,
	PanicMetadataRegistry,
} from "@sekhmet/panic";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assert, assertEquals } from "@std/assert";

interface PanicMeta {
	handler: string;
	seenAt: Date;
}

const registry = new PanicMetadataRegistry<PanicMeta>((payload) => {
	return { handler: "main", seenAt: payload.timestamp };
});

const runtime = definePanicRuntime();
runtime.setHook(({ payload }) => {
	if (payload instanceof Panic) registry.getOrInsert(payload);
});

const caught = runtime.catchUnwind(() => {
	return panic({ message: "bad state", cause: null });
});
const payload = unwrapPanicked(expectReady(poll(caught), "sync work"));

assert(payload instanceof Panic);
assertEquals(registry.size, 1);
assertEquals(registry.get(payload), {
	handler: "main",
	seenAt: payload.timestamp,
});
```

## How to recognize a hook that failed

When a hook throws while a boundary reports sync work, the boundary stops
recovering and throws a `Panic (PanicHook)` instead, which an outer boundary
catches. Recognize it
with `isPanicHookFailure`, which narrows the payload so its cause's `payload`
(what the hook was reporting) and `thrown` (what the hook threw) need no
cast:

```ts
import { definePanicRuntime, isPanicHookFailure, panic } from "@sekhmet/panic";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assert, assertEquals } from "@std/assert";

const outer = definePanicRuntime();
outer.setHook(() => {}); // keep the example quiet
const inner = definePanicRuntime();
inner.setHook(() => {
	throw new Error("reporter offline");
});

const caught = outer.catchUnwind(() => {
	return inner.catchUnwind(() => {
		return panic({ message: "bad state", cause: null });
	});
});
const payload = unwrapPanicked(expectReady(poll(caught), "sync work"));

assert(isPanicHookFailure(payload));
assertEquals(String(payload.cause.thrown), "Error: reporter offline");
```

`isPanicHookFailure` accepts only a panic a boundary threw, never a `Panic`
built by hand with the same name.
