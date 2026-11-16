import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { Deferred, Ready } from "@/src/continuation/continuation.ts";
import { Effect, type EffectOutput } from "@/src/effect/mini/effect.ts";
import { fork } from "@/src/execution/mod.ts";
import { type Fiber, join } from "@/src/fiber/mini/fiber.ts";
import type { FiberResult } from "@/src/fiber/mini/fiber-error.ts";
import {
	ExecutionContext,
	Runtime,
	type RuntimeConfig,
} from "@/src/runtime/runtime.ts";
import { type ScheduleFn, Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";

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

function resultOf<I, T, E>(
	fiber: Fiber<I, T, E>,
): FiberResult<T, E> | undefined {
	let outcome: FiberResult<T, E> | undefined;
	join(fiber, (result) => {
		outcome = result;
	});
	return outcome;
}

const stateOf = <I, T, E>(fiber: Fiber<I, T, E>): string =>
	unionKinds(getStructParams(fiber).fiberState);

/** An effect that needs `depth` Deferred steps before it is Ready. */
function deepEffect(depth: number): Effect<void, number, never> {
	const build = (n: number): EffectOutput<number, never> =>
		n === 0 ? Ready(Ok(depth)) : Deferred(() => build(n - 1));
	return new Effect(() => build(depth));
}

Deno.test("Runtime.createContext() shares the runtime's config", () => {
	// Given: a runtime with a config
	const config: RuntimeConfig = {
		scheduler: new Scheduler({ schedule: sync() }),
	};
	const runtime = new Runtime({ input: 1, config });

	// When: creating an execution context
	const ctx = runtime.createContext();

	// Then: the context carries the very same config
	assertInstanceOf(ctx, ExecutionContext);
	assertStrictEquals(getStructParams(ctx).config, config);
});

Deno.test("ExecutionContext.fork() runs the effect with the given input", () => {
	// Given: a context and an effect that echoes its input
	const ctx = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	}).createContext();
	const echo = new Effect<string, string, never>((input) => Ready(Ok(input)));

	// When: forking it with an input
	const fiber = ctx.fork(echo, "hello");

	// Then: the fiber completes with that input
	assertEquals(resultOf(fiber), Ok("hello"));
});

Deno.test("ExecutionContext.fork() reuses the parent's config for the child", () => {
	// Given: a context over a specific config
	const config: RuntimeConfig = {
		scheduler: new Scheduler({ schedule: sync() }),
	};
	const ctx = new Runtime({ input: 0, config }).createContext();

	// When: forking a child effect
	const fiber = ctx.fork(new Effect(() => Ready(Ok(1))), "child-input");

	// Then: the child's runtime has the parent's config and its own input
	const childRuntime = getStructParams(getStructParams(fiber).runtime);
	assertStrictEquals(childRuntime.config, config);
	assertEquals(childRuntime.input, "child-input");
});

Deno.test("Effects receive a context that can fork siblings", () => {
	// Given: an effect that forks a child through its context
	let child: Fiber<number, number, never> | undefined;
	const parent = new Effect<void, string, never>((_input, ctx) => {
		child = ctx.fork<number, number, never>(
			new Effect((n) => Ready(Ok(n * 2))),
			21,
		);
		return Ready(Ok("parent"));
	});
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: running the parent
	const fiber = fork(runtime, parent);

	// Then: both parent and child complete
	assertEquals(resultOf(fiber), Ok("parent"));
	assertEquals(child && resultOf(child), Ok(42));
});

Deno.test("FiberConfig.stepBudget bounds the steps a fiber takes per scheduling", async (t) => {
	await t.step("budget of 1 yields after every step", () => {
		// Given: a parked scheduler and a fiber budget of one step
		const { schedule, flush } = manualSchedule();
		const runtime = new Runtime({
			input: undefined,
			config: {
				scheduler: new Scheduler({ schedule }),
				fiberConfig: { stepBudget: 1 },
			},
		});

		// When: forking a three-step-deep effect and flushing turn by turn
		const fiber = fork(runtime, deepEffect(2));
		const states = [stateOf(fiber)];
		for (let i = 0; i < 4; i++) {
			flush();
			states.push(stateOf(fiber));
		}

		// Then: the fiber advances exactly one step per turn
		assertEquals(states, [
			"Queued",
			"Running",
			"Running",
			"Running",
			"Complete",
		]);
		assertEquals(resultOf(fiber), Ok(2));
	});

	await t.step("default budget finishes a shallow effect in one turn", () => {
		// Given: a parked scheduler and no fiber config
		const { schedule, flush } = manualSchedule();
		const runtime = new Runtime({
			input: undefined,
			config: { scheduler: new Scheduler({ schedule }) },
		});

		// When: forking a three-step-deep effect and flushing once
		const fiber = fork(runtime, deepEffect(2));
		flush();

		// Then: it is complete after a single turn
		assertEquals(resultOf(fiber), Ok(2));
	});
});
