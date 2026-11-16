import { match } from "@sekhmet/enum/core/mini/exit";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { fork } from "@/src/execution/mod.ts";
import { join } from "@/src/fiber/mini/fiber.ts";
import type { FiberResult } from "@/src/fiber/mini/fiber-error.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";
import type * as mini from "../mini/mod.ts";
import { Effect as MiniEffect, Success as MiniSuccess } from "../mini/mod.ts";
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

Deno.test("main Effect is an instance of mini Effect", () => {
	// Given: a main effect
	const effect = Success(1);

	// When: checking it against the mini class
	const isMini = effect instanceof MiniEffect;

	// Then: it is one, so mini operations accept it
	assertEquals(isMini, true);
});

Deno.test("Effect methods return main Effects so calls chain", () => {
	// Given: a main effect
	const effect = Success(2);

	// When: chaining several methods
	const chained = effect
		.map((x) => x + 1)
		.inspect(() => {})
		.andThen((x) => Success(x * 2))
		.zip(Success("z"));

	// Then: each step is a main Effect and the chain computes the value
	assertInstanceOf(chained, Effect);
	assertEquals(
		match(runSync(chained))({ Ok: (value) => value, Err: () => [] }),
		[6, "z"],
	);
});

Deno.test("Effect.fromMini converts a mini Effect and keeps a main one", () => {
	// Given: a mini effect and a main effect
	const miniEffect = MiniSuccess(3);
	const mainEffect = Success(3);

	// When: converting both
	const converted = Effect.fromMini(miniEffect);
	const kept = Effect.fromMini(mainEffect);

	// Then: the mini one becomes main, and the main one comes back unchanged
	assertInstanceOf(converted, Effect);
	assertStrictEquals(kept, mainEffect);
});
