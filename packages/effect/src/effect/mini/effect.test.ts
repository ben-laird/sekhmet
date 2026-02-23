import { Scheduler } from "@sekhmet/effect/scheduler/scheduler";
import { sync } from "@sekhmet/effect/scheduler/schedules";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Ready } from "../../continuation/continuation.ts";
import { fork } from "../../fiber/mini/fiber.ts";
import { Runtime } from "../../runtime/runtime.ts";
import { Effect, Failed, Failure, Success } from "./effect.ts";

Deno.test("Success creates an effect that completes with Ok", () => {
	// Given: a success effect with value 42
	const effect = Success(42);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork the effect
	const fiber = fork(runtime, effect);

	// Then: the fiber should complete with Ok(42)
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 42),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("Failure creates an effect that completes with Err", () => {
	// Given: a failure effect with error "not found"
	const effect = Failure("not found");
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork the effect
	const fiber = fork(runtime, effect);

	// Then: the fiber should complete with Err("not found")
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: () => {
					throw new Error("Expected Err, got Ok");
				},
				Err: (fiberError) =>
				match(fiberError)({
					Failed: (error) => assertEquals(error, "not found"),
					Cancelled: () => {
						throw new Error("Expected Failed, got Cancelled");
					},
					Panicked: () => {
						throw new Error("Expected Failed, got Panicked");
					},
				}),
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});

Deno.test("Effect can be constructed with custom logic", () => {
	// Given: a custom effect that parses a number from a string
	const parseEffect = new Effect<string, number, string>((input) => {
		const num = Number(input);
		return Ready(Number.isNaN(num) ? Err(Failed("not a number")) : Ok(num));
	});
	const runtime = new Runtime({
		input: "123",
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork the effect with valid input
	const fiber = fork(runtime, parseEffect);

	// Then: the fiber should complete with parsed number
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 123),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber still queued");
		},
		Running: () => {
			throw new Error("Fiber still running");
		},
		Suspended: () => {
			throw new Error("Fiber suspended");
		},
	});
});
