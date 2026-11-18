---
kind: how-to
---

# Recipes

Runnable patterns built from the public API. They share a small `run` helper
that forks an effect and resolves with its result:

```ts
import { assertEquals } from "@std/assert";
import type { Effect } from "@sekhmet/effect/effect";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Success } from "@sekhmet/effect/effect";
import { Ok } from "@sekhmet/enum/result/mini";

function run<T, E>(effect: Effect<void, T, E>): Promise<FiberResult<T, E>> {
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});
	return new Promise((resolve) => fork(runtime, effect).join(resolve));
}

assertEquals(await run(Success(1)), Ok(1));
```

Each recipe below repeats the imports it needs so it runs on its own.

## Wrap a promise

A promise-returning function becomes an effect whose rejection is a typed
failure. Pass the function, not the promise, so the work starts only when a
fiber runs the effect.

```ts
import { assertEquals } from "@std/assert";
import { Async, Ready } from "@sekhmet/effect/continuation";
import { Effect, Failed } from "@sekhmet/effect/effect";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Failed as FiberFailed } from "@sekhmet/effect/fiber/mini";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Err, Ok } from "@sekhmet/enum/result/mini";

function fromPromise<T>(start: () => Promise<T>): Effect<void, T, unknown> {
	return new Effect(() =>
		Async((resolve) => {
			start().then(
				(value) => resolve(Ready(Ok(value))),
				(reason: unknown) => resolve(Ready(Err(Failed(reason)))),
			);
		}),
	);
}

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});
const run = <T>(effect: Effect<void, T, unknown>) =>
	new Promise<FiberResult<T, unknown>>((resolve) =>
		fork(runtime, effect).join(resolve),
	);

assertEquals(
	await run(fromPromise(() => Promise.resolve(3)).map((n) => n * 2)),
	Ok(6),
);
// A rejection reaches the fiber as a typed failure
assertEquals(
	await run(fromPromise(() => Promise.reject("offline"))),
	Err(FiberFailed("offline")),
);
```

## Cancel after a timeout

`cancel` stops a fiber and runs the cleanup of the work it waits on.

```ts
import { assertEquals } from "@std/assert";
import { Async, Ready } from "@sekhmet/effect/continuation";
import { Effect } from "@sekhmet/effect/effect";
import { Cancelled } from "@sekhmet/effect/fiber/mini";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Err, Ok } from "@sekhmet/enum/result/mini";

let timersCleared = 0;
const sleep = (ms: number) =>
	new Effect<void, string, never>(() =>
		Async((resolve) => {
			const timer = setTimeout(() => resolve(Ready(Ok("done"))), ms);
			return () => {
				timersCleared++;
				clearTimeout(timer);
			};
		}),
	);

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const fiber = fork(runtime, sleep(10_000));
const result = new Promise<FiberResult<string, never>>((resolve) =>
	fiber.join(resolve),
);
setTimeout(() => fiber.cancel(), 5);

assertEquals(await result, Err(Cancelled()));
assertEquals(timersCleared, 1);
```

## Run two effects concurrently

`zip` runs both on their own fibers and succeeds with both values. If one fails,
the other is cancelled.

```ts
import { assertEquals } from "@std/assert";
import { Async, Ready } from "@sekhmet/effect/continuation";
import { Effect, Failure } from "@sekhmet/effect/effect";
import { type FiberResult, fork } from "@sekhmet/effect/fiber";
import { Failed } from "@sekhmet/effect/fiber/mini";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Err, Ok } from "@sekhmet/enum/result/mini";

const after = <T>(ms: number, value: T) =>
	new Effect<void, T, string>(() =>
		Async((resolve) => {
			const timer = setTimeout(() => resolve(Ready(Ok(value))), ms);
			return () => clearTimeout(timer);
		}),
	);

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});
const run = <T>(effect: Effect<void, T, string>) =>
	new Promise<FiberResult<T, string>>((resolve) =>
		fork(runtime, effect).join(resolve),
	);

assertEquals(
	await run(after(5, "user").zip(after(1, ["post"]))),
	Ok(["user", ["post"]]),
);

// The slow side is cancelled (its timer cleared) when the other fails
assertEquals(
	await run(after(10_000, "user").zip(Failure("posts unavailable"))),
	Err(Failed("posts unavailable")),
);
```

## Pass dependencies as input

Effects read their input from the runtime, so the same effect can run against
real or test dependencies.

```ts
import { assertEquals } from "@std/assert";
import { Ready } from "@sekhmet/effect/continuation";
import { Effect } from "@sekhmet/effect/effect";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

interface Deps {
	now: () => number;
}

const timestamp = new Effect<Deps, string, never>((deps) =>
	Ready(Ok(new Date(deps.now()).toISOString())),
);

const testRuntime = new Runtime<Deps>({
	input: { now: () => 0 },
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const results: unknown[] = [];
fork(testRuntime, timestamp).join((result) => results.push(result));
assertEquals(results, [Ok("1970-01-01T00:00:00.000Z")]);
```

## Recover from a typed failure

`orElse` replaces a typed failure with another effect; `mapOr` with a value.
Neither catches thrown exceptions, which reach the fiber as `Panicked`.

```ts
import { assertEquals } from "@std/assert";
import { type Effect, Failure, Success } from "@sekhmet/effect/effect";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const results: unknown[] = [];
const fromCache: Effect<void, string, string> = Failure("cache miss");
const cached = fromCache.orElse((reason) => Success(`fetched (${reason})`));
fork(runtime, cached).join((result) => results.push(result));

assertEquals(results, [Ok("fetched (cache miss)")]);
```

## Keep a busy app responsive

With `sync`, a long chain of steps runs before `fork` returns. A yielding
schedule spreads the work over event-loop turns instead; `adaptive` drains a
deep queue in microtasks and yields macrotasks when it is shallow.

```ts
import { adaptive, Scheduler } from "@sekhmet/effect/scheduler";
import { Runtime } from "@sekhmet/effect/runtime";

const runtime = new Runtime({
	input: undefined,
	config: {
		scheduler: new Scheduler({
			schedule: adaptive({ busyThreshold: 32 }),
			stepBudget: 64,
		}),
		fiberConfig: { stepBudget: 256 },
	},
});
```
