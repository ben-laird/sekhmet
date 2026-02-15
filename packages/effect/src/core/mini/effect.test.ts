import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Ready } from "./continuation.ts";
import { Effect, Failure, Success } from "./effect.ts";
import { fork, Runtime } from "./runtime.ts";

Deno.test("Success creates an effect that completes with Ok", () => {
	// Given: a success effect with value 42
	const effect = Success(42);
	const runtime = new Runtime({ input: undefined });

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
		Cancelled: () => {
			throw new Error("Fiber was cancelled");
		},
	});
});

Deno.test("Failure creates an effect that completes with Err", () => {
	// Given: a failure effect with error "not found"
	const effect = Failure("not found");
	const runtime = new Runtime({ input: undefined });

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
				Err: (error) => assertEquals(error, "not found"),
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
		Cancelled: () => {
			throw new Error("Fiber was cancelled");
		},
	});
});

Deno.test("Effect can be constructed with custom logic", () => {
	// Given: a custom effect that parses a number from a string
	const parseEffect = new Effect<string, number, string>((input) => {
		const num = Number(input);
		return Ready(Number.isNaN(num) ? Err("not a number") : Ok(num));
	});
	const runtime = new Runtime({ input: "123" });

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
		Cancelled: () => {
			throw new Error("Fiber was cancelled");
		},
	});
});
