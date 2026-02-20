import { Scheduler } from "@sekhmet/effect/scheduler/scheduler";
import { sync } from "@sekhmet/effect/scheduler/schedules";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Ready } from "../continuation/continuation.ts";
import { Effect } from "../effect/mini/effect.ts";
import { fork } from "../fiber/mini/fiber.ts";
import { Runtime } from "./runtime.ts";

Deno.test("runtime provides input to effects", () => {
	// Given: an effect that uses its input
	const effect = new Effect<number, number, never>((input) => {
		return Ready(Ok(input * 2));
	});
	const runtime = new Runtime({
		input: 21,
		scheduler: new Scheduler({ schedule: sync() }),
	});

	// When: we fork the effect
	const fiber = fork(runtime, effect);

	// Then: the effect should receive and use the input
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
