---
kind: tutorial
---

# Getting started

This guide builds an effect, runs it, reads its result, and then makes it
asynchronous. The [concepts](./concepts.md) page explains each piece in depth.

## Install

```sh
deno add jsr:@sekhmet/effect   # Deno
npx jsr add @sekhmet/effect    # npm (also: pnpm dlx, yarn dlx, bunx)
```

Results and errors are `@sekhmet/enum` values, so examples also import from
`@sekhmet/enum`.

## 1. Describe the work

An effect is a description: building one runs nothing. `Success` and `Failure`
make effects that finish immediately, and methods derive new effects.

```ts
import { Success } from "@sekhmet/effect/effect";

const price = Success(40).map((n) => n + 2); // Effect<void, number, never>
```

## 2. Choose where it runs

A `Runtime` holds the input every effect it runs receives, and the scheduler
that decides when fibers take their turns. The `sync` schedule runs work
immediately, which is the simplest choice for scripts and tests.

```ts
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});
```

## 3. Run it and read the result

`fork` starts the effect on a new fiber. `join` registers a callback that
receives the fiber's result once it completes (immediately, if it already has).
The result is a `Result`: `Ok(value)`, or `Err` holding a `FiberError`.

```ts
import { assertEquals } from "@std/assert";
import { Success } from "@sekhmet/effect/effect";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { match } from "@sekhmet/enum/core/mini";

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const fiber = fork(
	runtime,
	Success(40).map((n) => n + 2),
);

let message = "";
fiber.join((result) => {
	message = match(result)({
		Ok: (value) => `price: ${value}`,
		Err: (error) =>
			match(error)({
				Failed: (cause) => `failed: ${String(cause)}`,
				Cancelled: () => "cancelled",
				Panicked: (exception) => `bug: ${String(exception)}`,
			}),
	});
});

assertEquals(message, "price: 42");
```

A fiber ends in one of four ways:

- `Ok(value)`: the effect succeeded.
- `Err(Failed(error))`: the effect failed with its typed error `E`.
- `Err(Cancelled())`: someone cancelled the fiber.
- `Err(Panicked(exception))`: code inside the effect threw.

## 4. Await it as a promise

To use a fiber from `async` code, wrap `join` in a promise:

```ts
import { assertEquals } from "@std/assert";
import { Success } from "@sekhmet/effect/effect";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { microtask, Scheduler } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: microtask() }) },
});

const result = await new Promise<FiberResult<number, never>>((resolve) =>
	fork(runtime, Success(1)).join(resolve),
);

assertEquals(result, Ok(1));
```

## 5. Do asynchronous work

An effect is a function from its input to a **continuation**. `Async` is the
continuation for work that finishes later: it receives a `resolve` callback and
may return a cleanup function, which runs if the fiber is cancelled while it
waits.

```ts
import { assertEquals } from "@std/assert";
import { Async, Ready } from "@sekhmet/effect/continuation";
import { Effect } from "@sekhmet/effect/effect";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

const sleep = (ms: number) =>
	new Effect<void, number, never>(() =>
		Async((resolve) => {
			const timer = setTimeout(() => resolve(Ready(Ok(ms))), ms);
			return () => clearTimeout(timer); // runs on cancel
		}),
	);

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const result = await new Promise<FiberResult<number, never>>((resolve) =>
	fork(
		runtime,
		sleep(10).map((ms) => ms * 2),
	).join(resolve),
);

assertEquals(result, Ok(20));
```

Next: [concepts](./concepts.md) covers inputs, errors, fibers, schedulers and
cancellation; [recipes](./recipes.md) has ready-made patterns.
