---
kind: explanation
---

# Concepts

How `@sekhmet/effect` runs work: effects and their continuations, the error
channel, fibers, the runtime and its scheduler, and cancellation.

## Effects

`Effect<I, T, E>` wraps a function `(input: I, ctx) => Continuation`. The three
type parameters are:

- `I`, the **input** the effect receives when it runs;
- `T`, the **success** value;
- `E`, the typed **error**.

Building an effect never runs it. You build them with `Success(value)`,
`Failure(error)`, or `new Effect(fn)`, and derive new ones with combinators:

| Combinator                                             | Runs when     | Does                                               |
| ------------------------------------------------------ | ------------- | -------------------------------------------------- |
| `map(f)`                                               | success       | transforms the value                               |
| `mapError(f)`                                          | typed failure | transforms the error                               |
| `mapOr(d, f)`                                          | either        | maps the value, or uses `d` on a typed failure     |
| `mapOrElse({Ok,Err})`                                  | either        | maps both arms to one success type                 |
| `andThen(f)`                                           | success       | runs the effect `f(value)` with the **same input** |
| `and(next)`                                            | success       | runs `next` with the **value as its input**        |
| `orElse(f)`                                            | typed failure | runs the effect `f(error)` with the same input     |
| `or(fallback)`                                         | typed failure | runs `fallback` with the **error as its input**    |
| `inspect(f)`, `inspectError(f)`, `inspectException(f)` | that arm      | calls `f` for a side effect, keeps the outcome     |
| `zip(other)`                                           | —             | runs both concurrently, succeeds with a tuple      |

The input comes from the runtime (see below), so an effect can read
configuration or dependencies without closures:

```ts
import { assertEquals } from "@std/assert";
import { Ready } from "@sekhmet/effect/continuation";
import { Effect } from "@sekhmet/effect/effect";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

type Config = { greeting: string };

const greet = new Effect<Config, string, never>((config) =>
	Ready(Ok(`${config.greeting}, world`)),
);

const runtime = new Runtime({
	input: { greeting: "Hello" },
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const results: unknown[] = [];
fork(runtime, greet).join((result) => results.push(result));
assertEquals(results, [Ok("Hello, world")]);
```

## Continuations

An effect's function returns a `Continuation`, one step of the computation:

- `Ready(result)`: done; `result` is `Ok(value)` or `Err(EffectError)`.
- `Async((resolve) => cleanup)`: waiting on outside work. Call `resolve` with
  the next continuation when it finishes. The optional returned function is the
  cleanup a cancelled fiber calls.
- `Deferred(() => next)`: one more synchronous step. Combinators use it so long
  chains run step by step instead of growing the call stack.

Only the first call to `resolve` counts; later calls are ignored.

## Errors

An effect fails in one of two ways, the two variants of `EffectError`:

- `Failed(error)`: the typed error `E`, from `Failure` or `mapError`. The
  error-handling combinators (`mapError`, `mapOr`, `mapOrElse`, `or`, `orElse`,
  `inspectError`) see only these.
- `ExceptionOccurred(exception)`: something threw. Every combinator catches
  exceptions from the callbacks you pass it and turns them into this variant.
  The typed handlers skip it; only `inspectException` sees it.

When a fiber completes, these become its `FiberError`: `Failed(error)` stays
`Failed`, and `ExceptionOccurred` becomes `Panicked(exception)`. A third
variant, `Cancelled`, marks a cancelled fiber. A thrown exception is a bug to
fix, not a failure to handle; model expected failures with `Failure`.

## Fibers

A **fiber** is one running effect. `fork(runtime, effect)` creates it and queues
its first step on the runtime's scheduler. Its state moves through:

1. `Queued`: created, not started.
2. `Running`: stepping through continuations.
3. `Suspended`: waiting on an `Async` continuation.
4. `Complete`: finished with a `FiberResult` (`Ok`, or `Err(FiberError)`).

A fiber runs at most 1024 steps per turn (`fiberConfig.stepBudget` on the
runtime) and then reschedules itself, so one long effect cannot starve other
fibers.

`fiber.join(finalizer)` registers a **finalizer**: a callback that receives the
result when the fiber completes, or at once if it already has. Every finalizer
runs exactly once. A finalizer that throws is logged with `console.error` and
the others still run.

`fiber.joinEffect()` turns a fiber into an effect that waits for it, so you can
compose a running fiber with other effects. Its error is the fiber's whole
`FiberError`.

Inside an effect, `ctx.fork(effect, input)` (on the `ExecutionContext` passed as
the second argument) starts a child fiber with the same runtime configuration.
`zip` is built this way.

## The runtime and its scheduler

`new Runtime({ input, config })` holds:

- `input`: what every effect forked on it receives;
- `config.scheduler`: the `Scheduler` that runs fiber steps;
- `config.fiberConfig.stepBudget` (optional): steps per fiber turn, default
  1024.

A `Scheduler` runs queued tasks in FIFO order, up to `stepBudget` tasks per turn
(default 128). Between turns it calls its **schedule function** to decide when
the next turn runs. The built-in schedules:

| Schedule      | Next turn runs                                                                     |
| ------------- | ---------------------------------------------------------------------------------- |
| `sync()`      | immediately, in the same call stack (stack-safe)                                   |
| `microtask()` | in a microtask (`queueMicrotask`)                                                  |
| `macrotask()` | in a macrotask (`setTimeout`, optional `delay`)                                    |
| `adaptive()`  | microtask when the queue is deep (`busyThreshold`, default 16), else macrotask     |
| `throttled()` | synchronously, except every `turnsPerTick` turns (default 4) it yields a macrotask |
| `batched()`   | microtask after a full turn (`fullTurnThreshold`, default 64), else macrotask      |

`sync` suits tests and scripts: a fork runs to completion (or to its first
`Async`) before `fork` returns. In an app, a yielding schedule keeps the event
loop responsive. You can also pass your own function; it receives the step to
run and a context with `queueDepth`, `turnIndex` and `stepsLastTurn`.

## Cancellation and cleanup

`fiber.cancel()` completes the fiber with `Err(Cancelled())` at once, then:

1. if the fiber was suspended, it calls the cleanup that its pending `Async`
   returned (a throwing cleanup is logged, not rethrown);
2. it runs the fiber's finalizers with the cancelled result.

Cancelling a completed fiber does nothing, and a late `resolve` from the
cancelled async work is ignored.

```ts
import { assertEquals } from "@std/assert";
import { Async } from "@sekhmet/effect/continuation";
import { Effect } from "@sekhmet/effect/effect";
import { Cancelled } from "@sekhmet/effect/fiber/mini";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Err } from "@sekhmet/enum/result/mini";

const log: string[] = [];
const wait = new Effect<void, never, never>(() =>
	Async(() => () => log.push("cleanup")),
);

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const fiber = fork(runtime, wait);
fiber.join((result) => {
	log.push("finalizer");
	assertEquals(result, Err(Cancelled()));
});

fiber.cancel();
assertEquals(log, ["cleanup", "finalizer"]);
```

`zip` uses cancellation for you: if either side fails, it cancels the other, and
cancelling the zipped fiber cancels both sides.
