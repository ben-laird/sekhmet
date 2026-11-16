import { match } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { fork } from "@/src/execution/mod.ts";
import { join } from "@/src/fiber/mini/fiber.ts";
import type { FiberResult } from "@/src/fiber/mini/fiber-error.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";
import type * as mini from "../mini/mod.ts";
import { Effect, Failure, Success } from "./mod.ts";

function runSync<T, E>(effect: mini.Effect<void, T, E>): FiberResult<T, E> {
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});
	let outcome: FiberResult<T, E> | undefined;
	join(fork(runtime, effect), (result) => {
		outcome = result;
	});
	if (outcome === undefined) {
		throw new Error("Expected the fiber to complete synchronously");
	}
	return outcome;
}

Deno.test("Success() returns a main Effect that chains methods", () => {
	// Given: a main effect built with Success
	const effect = Success(5);

	// When: chaining a method and running it
	const result = runSync(effect.map((x) => x * 2));

	// Then: it is a main Effect and yields the mapped value
	assertInstanceOf(effect, Effect);
	assertEquals(match(result)({ Ok: (value) => value, Err: () => -1 }), 10);
});

Deno.test("Failure() returns a main Effect that fails with the error", () => {
	// Given: a main effect built with Failure
	const effect = Failure("boom");

	// When: mapping the error and running it
	const result = runSync(effect.mapError((e) => `error: ${e}`));

	// Then: it is a main Effect and fails with the mapped typed error
	assertInstanceOf(effect, Effect);
	const message = match(result)({
		Ok: () => "unexpected success",
		Err: (fiberError) =>
			match(fiberError)({
				Failed: (error) => error,
				Cancelled: () => "cancelled",
				Panicked: () => "panicked",
			}),
	});
	assertEquals(message, "error: boom");
});
