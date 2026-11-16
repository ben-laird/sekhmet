import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import {
	Async,
	type Continuation,
	Deferred,
	Ready,
} from "@/src/continuation/continuation.ts";
import { Effect, type EffectResult } from "@/src/effect/mini/effect.ts";
import { fork } from "@/src/execution/mod.ts";
import { cancel, type Fiber, join } from "@/src/fiber/mini/fiber.ts";
import { Cancelled, type FiberResult } from "@/src/fiber/mini/fiber-error.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { type ScheduleFn, Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";

function runtimeWith(schedule: ScheduleFn, stepBudget?: number): Runtime<void> {
	return new Runtime({
		input: undefined,
		config: {
			scheduler: new Scheduler({ schedule }),
			fiberConfig: stepBudget === undefined ? undefined : { stepBudget },
		},
	});
}

/** A schedule that parks each turn until the test flushes it. */
function manualSchedule(): { schedule: ScheduleFn; flush: () => void } {
	const turns: (() => void)[] = [];
	return {
		schedule: (runStep) => {
			turns.push(runStep);
		},
		flush: () => turns.shift()?.(),
	};
}

/** An Async effect whose resolver and cleanup are exposed to the test. */
function controlledEffect<T>(): {
	effect: Effect<void, T, string>;
	resolve: (c: Continuation<EffectResult<T, string>>) => void;
	cleanups: () => number;
} {
	let resolver:
		| ((c: Continuation<EffectResult<T, string>>) => void)
		| undefined;
	let cleanupCalls = 0;
	return {
		effect: new Effect(() =>
			Async((resolve) => {
				resolver = resolve;
				return () => {
					cleanupCalls++;
				};
			}),
		),
		resolve: (c) => resolver?.(c),
		cleanups: () => cleanupCalls,
	};
}

const stateOf = <I, T, E>(fiber: Fiber<I, T, E>): string =>
	unionKinds(getStructParams(fiber).fiberState);

function recorder<T, E>(): {
	finalizer: (r: FiberResult<T, E>) => void;
	seen: FiberResult<T, E>[];
} {
	const seen: FiberResult<T, E>[] = [];
	return { finalizer: (r) => seen.push(r), seen };
}

Deno.test("join() on a complete fiber calls the finalizer immediately", () => {
	// Given: a fiber that already completed
	const fiber = fork(
		runtimeWith(sync()),
		new Effect<void, number, never>(() => Ready(Ok(5))),
	);
	const { finalizer, seen } = recorder<number, never>();

	// When: joining it
	join(fiber, finalizer);

	// Then: the finalizer ran synchronously with the result
	assertEquals(seen, [Ok(5)]);
});

Deno.test("join() on a pending fiber defers the finalizer until completion", async (t) => {
	await t.step("Queued", () => {
		// Given: a fiber that has not started yet
		const { schedule, flush } = manualSchedule();
		const fiber = fork(
			runtimeWith(schedule),
			new Effect<void, number, never>(() => Ready(Ok(1))),
		);
		const { finalizer, seen } = recorder<number, never>();

		// When: joining before and after it runs
		join(fiber, finalizer);
		const before = [...seen];
		flush();

		// Then: the finalizer only ran on completion
		assertEquals(stateOf(fiber), "Complete");
		assertEquals(before, []);
		assertEquals(seen, [Ok(1)]);
	});

	await t.step("Running", () => {
		// Given: a fiber mid-way through, with a one-step budget
		const { schedule, flush } = manualSchedule();
		const fiber = fork(
			runtimeWith(schedule, 1),
			new Effect<void, number, never>(() => Deferred(() => Ready(Ok(2)))),
		);
		flush();
		const { finalizer, seen } = recorder<number, never>();

		// When: joining while Running and then letting it finish
		const state = stateOf(fiber);
		join(fiber, finalizer);
		flush();
		flush();

		// Then: the finalizer ran on completion
		assertEquals(state, "Running");
		assertEquals(seen, [Ok(2)]);
	});

	await t.step("Suspended", () => {
		// Given: a fiber suspended on an async effect
		const control = controlledEffect<string>();
		const fiber = fork(runtimeWith(sync()), control.effect);
		const { finalizer, seen } = recorder<string, string>();

		// When: joining while Suspended and then resuming it
		const state = stateOf(fiber);
		join(fiber, finalizer);
		control.resolve(Ready(Ok("resumed")));

		// Then: the finalizer ran on completion
		assertEquals(state, "Suspended");
		assertEquals(seen, [Ok("resumed")]);
	});
});

Deno.test("join() notifies every joiner in registration order", () => {
	// Given: a suspended fiber with two joiners
	const control = controlledEffect<number>();
	const fiber = fork(runtimeWith(sync()), control.effect);
	const order: string[] = [];
	join(fiber, () => order.push("first"));
	join(fiber, () => order.push("second"));

	// When: the fiber completes
	control.resolve(Ready(Ok(1)));

	// Then: both joiners ran once, in order
	assertEquals(order, ["first", "second"]);
});

Deno.test("cancel() completes a fiber with Err(Cancelled) from any pending state", async (t) => {
	await t.step("Queued: the effect never starts", () => {
		// Given: a queued fiber whose effect records when it starts
		const { schedule, flush } = manualSchedule();
		let started = false;
		const fiber = fork(
			runtimeWith(schedule),
			new Effect<void, number, never>(() => {
				started = true;
				return Ready(Ok(1));
			}),
		);
		const { finalizer, seen } = recorder<number, never>();
		join(fiber, finalizer);

		// When: cancelling it and then letting the scheduler run
		cancel(fiber);
		flush();

		// Then: it is cancelled and the effect never ran
		assertEquals(seen, [Err(Cancelled<never>())]);
		assertEquals(stateOf(fiber), "Complete");
		assertEquals(started, false);
	});

	await t.step("Running: no further steps are taken", () => {
		// Given: a running fiber with a one-step budget and a tracked later step
		const { schedule, flush } = manualSchedule();
		let reachedLaterStep = false;
		const fiber = fork(
			runtimeWith(schedule, 1),
			new Effect<void, number, never>(() =>
				Deferred(() => {
					reachedLaterStep = true;
					return Ready(Ok(1));
				}),
			),
		);
		flush();
		const { finalizer, seen } = recorder<number, never>();
		join(fiber, finalizer);

		// When: cancelling while Running and flushing the rescheduled turn
		cancel(fiber);
		flush();

		// Then: it is cancelled and never advanced
		assertEquals(seen, [Err(Cancelled<never>())]);
		assertEquals(reachedLaterStep, false);
	});

	await t.step("Suspended: the async cleanup runs", () => {
		// Given: a suspended fiber with a cleanup
		const control = controlledEffect<number>();
		const fiber = fork(runtimeWith(sync()), control.effect);
		const { finalizer, seen } = recorder<number, string>();
		join(fiber, finalizer);

		// When: cancelling it
		cancel(fiber);

		// Then: it is cancelled and the cleanup ran once
		assertEquals(seen, [Err(Cancelled<never>())]);
		assertEquals(control.cleanups(), 1);
	});

	await t.step("Suspended without a cleanup", () => {
		// Given: a fiber suspended on an Async that returns no cleanup
		const fiber = fork(
			runtimeWith(sync()),
			new Effect<void, number, never>(() => Async(() => {})),
		);
		const { finalizer, seen } = recorder<number, never>();
		join(fiber, finalizer);

		// When: cancelling it
		cancel(fiber);

		// Then: it is cancelled without error
		assertEquals(seen, [Err(Cancelled<never>())]);
	});
});

Deno.test("cancel() on a complete fiber is a no-op", () => {
	// Given: a completed fiber
	const fiber = fork(
		runtimeWith(sync()),
		new Effect<void, number, never>(() => Ready(Ok(3))),
	);

	// When: cancelling it
	cancel(fiber);

	// Then: its result is unchanged
	const { finalizer, seen } = recorder<number, never>();
	join(fiber, finalizer);
	assertEquals(seen, [Ok(3)]);
});

Deno.test("cancel() is idempotent", () => {
	// Given: a suspended fiber with a joiner and a cleanup
	const control = controlledEffect<number>();
	const fiber = fork(runtimeWith(sync()), control.effect);
	const { finalizer, seen } = recorder<number, string>();
	join(fiber, finalizer);

	// When: cancelling twice
	cancel(fiber);
	cancel(fiber);

	// Then: the joiner and the cleanup each ran once
	assertEquals(seen, [Err(Cancelled<never>())]);
	assertEquals(control.cleanups(), 1);
});

Deno.test("a cancelled fiber ignores a late async resolution", () => {
	// Given: a cancelled suspended fiber
	const control = controlledEffect<number>();
	const fiber = fork(runtimeWith(sync()), control.effect);
	const { finalizer, seen } = recorder<number, string>();
	join(fiber, finalizer);
	cancel(fiber);

	// When: the async work resolves afterwards
	control.resolve(Ready(Ok(99)));

	// Then: the fiber stays cancelled and joiners are not re-notified
	assertEquals(seen, [Err(Cancelled<never>())]);
});

Deno.test("cancel() with a throwing finalizer logs and skips later finalizers", () => {
	// Given: a suspended fiber with a throwing joiner before a healthy one
	using errorLog = stub(console, "error");
	const control = controlledEffect<number>();
	const fiber = fork(runtimeWith(sync()), control.effect);
	const order: string[] = [];
	join(fiber, () => {
		order.push("thrower");
		throw new Error("finalizer failed");
	});
	join(fiber, () => order.push("healthy"));

	// When: cancelling it
	cancel(fiber);

	// Then: the error is logged, the later joiner is skipped, the fiber is done
	// QUESTION: one throwing finalizer silently starves every later joiner.
	// Should each finalizer be isolated so the rest still run?
	assertEquals(order, ["thrower"]);
	assertEquals(errorLog.calls.length, 1);
	assertEquals(stateOf(fiber), "Complete");
});

Deno.test("a finalizer that cancels its own fiber does not re-notify joiners", () => {
	// Given: a suspended fiber whose first joiner re-enters cancel()
	const control = controlledEffect<number>();
	const fiber = fork(runtimeWith(sync()), control.effect);
	join(fiber, () => cancel(fiber));
	const { finalizer, seen } = recorder<number, string>();
	join(fiber, finalizer);

	// When: cancelling it
	cancel(fiber);

	// Then: every joiner and the cleanup ran exactly once
	assertEquals(seen, [Err(Cancelled<never>())]);
	assertEquals(control.cleanups(), 1);
});

Deno.test("cancel() still notifies joiners when the async cleanup throws", () => {
	// Given: a fiber suspended on an Async step whose cleanup throws
	using errorLog = stub(console, "error");
	const cleanupError = new Error("cleanup failed");
	const fiber = fork(
		runtimeWith(sync()),
		new Effect<void, number, never>(() =>
			Async(() => () => {
				throw cleanupError;
			}),
		),
	);
	const { finalizer, seen } = recorder<number, never>();
	join(fiber, finalizer);

	// When: cancelling it
	cancel(fiber);

	// Then: the joiner sees the cancellation and the cleanup error is logged
	assertEquals(seen, [Err(Cancelled<never>())]);
	assertEquals(stateOf(fiber), "Complete");
	assertEquals(errorLog.calls.length, 1);
	assertEquals(errorLog.calls[0]?.args.includes(cleanupError), true);
});
