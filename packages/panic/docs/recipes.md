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
2. Run the program's main function with `runtime.catchUnwind`, or with
   `runtime.catchUnwindAsync` if it returns a promise.
3. Read the `Result`: `Ok` holds what the program returned, `Err` what it
   threw.

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Ok } from "@sekhmet/enum/result/mini/core";
import { assertEquals } from "@std/assert";

const main = (): number => 0;

const runtime = definePanicRuntime();
const exit = runtime.catchUnwind(main);

assertEquals(exit, Ok(0));
```

Passing a promise-returning function to `catchUnwind` is a type error naming
`useCatchUnwindAsyncForPromises`, since that boundary would hand back the
promise as an `Ok` and miss its rejection: use `catchUnwindAsync` instead.

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

A boundary hands back `Err` of whatever was thrown, typed `unknown`, since it
catches every throw, not only `Panic`s. Convert it on the returned `Result`:

1. Run the work in `catchUnwind`.
2. Map the error with `mapErr`, narrowing the payload with
   `instanceof Panic`.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { Err } from "@sekhmet/enum/result/mini/core";
import { mapErr } from "@sekhmet/enum/result/mini/transform";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

function main(): number {
	panic({ message: "config is missing a port", cause: null });
}

const result = mapErr(runtime.catchUnwind(main), (payload) => {
	return payload instanceof Panic ? payload.message : "unknown failure";
});

assertEquals(result, Err("config is missing a port"));
```

## How to recover from async work

Use `catchUnwindAsync` for a function that returns a promise. It catches a
rejection and a synchronous throw from the function alike, so it never leaves
an unhandled rejection. It accepts any `PromiseLike`, so thenables work too.

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { mapErr } from "@sekhmet/enum/result/mini/transform";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

async function loadConfig(): Promise<string> {
	panic({ name: "Config", message: "missing port", cause: null });
}

const result = mapErr(
	await runtime.catchUnwindAsync(() => loadConfig()),
	(payload) => {
		if (payload instanceof Panic) {
			return { kind: "panic", name: payload.name };
		}
		return { kind: "unknown" };
	},
);

assertEquals(unwrapErr(result), { kind: "panic", name: "Panic (Config)" });
```

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
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
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

const payload = unwrapErr(
	runtime.catchUnwind(() => panic({ message: "bad state", cause: null })),
);

assert(payload instanceof Panic);
assertEquals(registry.size, 1);
assertEquals(registry.get(payload), {
	handler: "main",
	seenAt: payload.timestamp,
});
```

## How to recognize a hook that failed

When a hook throws, the boundary stops recovering and throws a
`Panic (PanicHook)` instead, which an outer boundary catches. Recognize it
with `isPanicHookFailure`, which narrows the payload so its cause's `payload`
(what the hook was reporting) and `thrown` (what the hook threw) need no
cast:

```ts
import { definePanicRuntime, isPanicHookFailure, panic } from "@sekhmet/panic";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { assert, assertEquals } from "@std/assert";

const outer = definePanicRuntime();
outer.setHook(() => {}); // keep the example quiet
const inner = definePanicRuntime();
inner.setHook(() => {
	throw new Error("reporter offline");
});

const payload = unwrapErr(
	outer.catchUnwind(() => {
		return inner.catchUnwind(() => {
			return panic({ message: "bad state", cause: null });
		});
	}),
);

assert(isPanicHookFailure(payload));
assertEquals(String(payload.cause.thrown), "Error: reporter offline");
```

`isPanicHookFailure` accepts only a panic a boundary threw, never a `Panic`
built by hand with the same name.
