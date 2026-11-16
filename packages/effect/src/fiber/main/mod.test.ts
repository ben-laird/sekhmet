import { match } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Async, Ready } from "@/src/continuation/continuation.ts";
import { Effect, Success } from "@/src/effect/main/mod.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";
import * as mini from "../mini/mod.ts";
import { Fiber, type FiberResult, fork } from "./mod.ts";

function syncRuntime(): Runtime<void> {
	return new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});
}

function outcome<T, E>(fiber: Fiber<void, T, E>): FiberResult<T, E> {
	let result: FiberResult<T, E> | undefined;
	fiber.join((value) => {
		result = value;
	});
	if (result === undefined) {
		throw new Error("Expected the fiber to complete synchronously");
	}
	return result;
}

Deno.test("fork returns a main Fiber that is also a mini Fiber", () => {
	// Given: a synchronous runtime and an effect
	const runtime = syncRuntime();

	// When: forking the effect
	const fiber = fork(runtime, Success(3));

	// Then: the fiber is main and mini, and its join method sees the result
	assertEquals(
		[fiber instanceof Fiber, fiber instanceof mini.Fiber],
		[true, true],
	);
	assertEquals(match(outcome(fiber))({ Ok: (v) => v, Err: () => -1 }), 3);
});

Deno.test("Fiber.joinEffect returns a main Effect that chains", async () => {
	// Given: a fiber that completes on a later tick
	const runtime = syncRuntime();
	const fiber = fork(
		runtime,
		new Effect<void, number, never>(() =>
			Async((resolve) => {
				const timer = setTimeout(() => resolve(Ready(Ok(4))), 0);
				return () => clearTimeout(timer);
			}),
		),
	);

	// When: joining it as an effect and chaining a method
	const joined = fiber.joinEffect().map((n) => n * 10);
	const result = await new Promise<FiberResult<number, mini.FiberError<never>>>(
		(resolve) => fork(runtime, joined).join(resolve),
	);

	// Then: the joined effect is a main Effect and carries the value through
	assertInstanceOf(joined, Effect);
	assertEquals(match(result)({ Ok: (v) => v, Err: () => -1 }), 40);
});

Deno.test("Fiber.cancel completes a suspended fiber as cancelled", () => {
	// Given: a fiber suspended on an effect that never resolves
	const runtime = syncRuntime();
	let cleanedUp = false;
	const fiber = fork(
		runtime,
		new Effect<void, number, never>(() =>
			Async(() => () => {
				cleanedUp = true;
			}),
		),
	);

	// When: cancelling it
	fiber.cancel();

	// Then: the fiber completed as Cancelled
	const kind = match(outcome(fiber))({
		Ok: () => "ok",
		Err: (error) =>
			match(error)({
				Failed: () => "failed",
				Cancelled: () => "cancelled",
				Panicked: () => "panicked",
			}),
	});
	assertEquals(kind, "cancelled");
	assertEquals(cleanedUp, true);
});
