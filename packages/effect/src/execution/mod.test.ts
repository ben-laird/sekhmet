import { Scheduler } from "@sekhmet/effect/scheduler/scheduler";
import { sync } from "@sekhmet/effect/scheduler/schedules";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Async, Ready } from "../continuation/continuation.ts";
import { Effect, Failed, Failure, Success } from "../effect/mini/effect.ts";
import { and, andThen, map, mapError, or, orElse } from "../effect/mini/operations.ts";
import { cancel } from "../fiber/mini/fiber.ts";
import { Runtime } from "../runtime/runtime.ts";
import { fork } from "./mod.ts";

// --- fork ---

Deno.test("fork creates and runs a fiber", () => {
	// Given: a simple success effect
	const effect = Success(42);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork the effect
	const fiber = fork(runtime, effect);

	// Then: the fiber should complete immediately
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

Deno.test("async effect suspends and resumes", async () => {
	// Given: an async effect that resolves after a delay
	const asyncEffect = new Effect<void, string, never>(() => {
		return Async((resolve) => {
			const timerId = setTimeout(() => {
				resolve(Ready(Ok("async result")));
			}, 10);

			// Return cleanup function
			return () => clearTimeout(timerId);
		});
	});

	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork the async effect
	const fiber = fork(runtime, asyncEffect);

	// Then: initially the fiber should be suspended
	let { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Suspended: () => {
			/* Expected state */
		},
		Complete: () => {
			throw new Error("Should not complete immediately");
		},
		Queued: () => {
			throw new Error("Should not be queued");
		},
		Running: () => {
			throw new Error("Should not be running");
		},
	});

	// Wait for async operation to complete
	await new Promise((resolve) => setTimeout(resolve, 20));

	// Then: after waiting, the fiber should be complete
	({ fiberState } = getStructParams(fiber));

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, "async result"),
				Err: () => {
					throw new Error("Expected Ok, got Err");
				},
			});
		},
		Queued: () => {
			throw new Error("Fiber should be complete");
		},
		Running: () => {
			throw new Error("Fiber should be complete");
		},
		Suspended: () => {
			throw new Error("Fiber should be complete");
		},
	});
});

// --- cancel ---

Deno.test("cancel does nothing on an already-complete fiber", () => {
	// Given: a simple effect that runs to completion
	const effect = Success(42);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork (which completes immediately) then cancel
	const fiber = fork(runtime, effect);
	cancel(fiber);

	// Then: the fiber remains complete
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: () => {
			/* Expected - already complete */
		},
		Queued: () => {
			throw new Error("Fiber should not be queued");
		},
		Running: () => {
			throw new Error("Fiber should not be running");
		},
		Suspended: () => {
			throw new Error("Fiber should not be suspended");
		},
	});
});

Deno.test("cancel calls cleanup function for suspended fiber", async () => {
	// Given: an async effect with a cleanup function
	let cleanupCalled = false;
	const asyncEffect = new Effect<void, string, never>(() => {
		return Async((resolve) => {
			const timerId = setTimeout(() => {
				resolve(Ready(Ok("done")));
			}, 100);

			// Return cleanup function
			return () => {
				clearTimeout(timerId);
				cleanupCalled = true;
			};
		});
	});

	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we fork (suspends on async) then cancel
	const fiber = fork(runtime, asyncEffect);

	let { fiberState } = getStructParams(fiber);
	match(fiberState)({
		Suspended: () => {
			/* Expected */
		},
		Complete: () => {
			throw new Error("Should not be complete yet");
		},
		Queued: () => {
			throw new Error("Should not be queued");
		},
		Running: () => {
			throw new Error("Should not be running");
		},
	});

	cancel(fiber);

	// Then: the fiber should be cancelled and cleanup called
	({ fiberState } = getStructParams(fiber));

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: () => {
					throw new Error("Expected Err(Cancelled), got Ok");
				},
				Err: (fiberError) =>
					match(fiberError)({
						Cancelled: () => {
							assertEquals(
								cleanupCalled,
								true,
								"Cleanup function should be called",
							);
						},
						Failed: () => {
							throw new Error("Expected Cancelled, got Failed");
						},
						Panicked: () => {
							throw new Error("Expected Cancelled, got Panicked");
						},
					}),
			});
		},
		Queued: () => {
			throw new Error("Should be cancelled");
		},
		Running: () => {
			throw new Error("Should be cancelled");
		},
		Suspended: () => {
			throw new Error("Should be cancelled");
		},
	});

	// Wait to ensure the timeout was actually cleared
	await new Promise((resolve) => setTimeout(resolve, 150));
});

// --- runtime input ---

Deno.test("runtime provides input to effects", () => {
	// Given: an effect that uses its input
	const effect = new Effect<number, number, never>((input) => {
		return Ready(Ok(input * 2));
	});
	const runtime = new Runtime({
		input: 21,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
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

// --- Effect constructors ---

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

// --- Effect operations ---

Deno.test("map transforms success value", () => {
	// Given: a success effect with value 10
	const effect = Success(10);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we map the value to double it
	const mapped = map(effect, (x) => x * 2);

	// Then: the fiber should complete with value 20
	const fiber = fork(runtime, mapped);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 20),
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

Deno.test("map preserves errors", () => {
	// Given: a failure effect
	const effect = Failure("error");
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we map the value
	const mapped = map(effect, (x) => x * 2);

	// Then: the fiber should complete with the original error
	const fiber = fork(runtime, mapped);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: () => {
					throw new Error("Expected Err, got Ok");
				},
				Err: (fiberError) =>
					match(fiberError)({
						Failed: (error) => assertEquals(error, "error"),
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

Deno.test("mapError transforms error value", () => {
	// Given: a failure effect with string error
	const effect = Failure("error");
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we map the error to its length
	const mapped = mapError(effect, (err: string) => err.length);

	// Then: the fiber should complete with error length
	const fiber = fork(runtime, mapped);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: () => {
					throw new Error("Expected Err, got Ok");
				},
				Err: (fiberError) =>
					match(fiberError)({
						Failed: (error) => assertEquals(error, 5),
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

Deno.test("mapError preserves success", () => {
	// Given: a success effect
	const effect = Success(10);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we map the error
	const mapped = mapError(effect, (err) => err);

	// Then: the fiber should complete with the original success value
	const fiber = fork(runtime, mapped);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 10),
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

Deno.test("and sequences two effects", () => {
	// Given: two effects that take specific inputs
	const parseNumber = new Effect<string, number, string>((input) => {
		const num = Number(input);
		return Ready(Number.isNaN(num) ? Err(Failed("not a number")) : Ok(num));
	});

	const doubleIt = new Effect<number, number, never>((input) => {
		return Ready(Ok(input * 2));
	});

	const runtime = new Runtime({
		input: "42",
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we chain them with 'and'
	const combined = and(parseNumber, doubleIt);

	// Then: the fiber should parse "42" and double it to 84
	const fiber = fork(runtime, combined);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 84),
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

Deno.test("andThen chains effects with computed next step", () => {
	// Given: an initial success effect and a chained effect
	const initial = Success(5);
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we chain multiple operations
	const chained = andThen(
		map(initial, (x) => x + 3),
		(value) => Success(value * 2),
	);

	// Then: the fiber should complete with (5 + 3) * 2 = 16
	const fiber = fork(runtime, chained);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 16),
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

Deno.test("or provides fallback on error", () => {
	// Given: a failure effect and a fallback
	const effect = Failure("not found");
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we provide a fallback using 'or'
	const withFallback = or(
		effect,
		new Effect<string, number, never>((errorMsg) => {
			return Ready(Ok(errorMsg.length));
		}),
	);

	// Then: the fiber should complete with the fallback value
	const fiber = fork(runtime, withFallback);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 9), // "not found".length
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

Deno.test("orElse provides computed fallback on error", () => {
	// Given: a failure effect with error "not found"
	const effect = Failure("not found");
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we map the error to a number and provide fallback
	const handled = orElse(
		mapError(effect, (err: string) => err.length),
		(_errorLength) => Success(0),
	);

	// Then: the fiber should complete with success value 0 (fallback)
	const fiber = fork(runtime, handled);
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 0),
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

Deno.test("deeply nested map operations", () => {
	// Given: an effect with many mapped steps
	let effect = Success(1);
	for (let i = 0; i < 100; i++) {
		effect = map(effect, (x) => x + 1);
	}

	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});

	// When: we run the deeply nested effect
	const fiber = fork(runtime, effect);

	// Then: it should complete with the correct value despite deep nesting
	const { fiberState } = getStructParams(fiber);

	match(fiberState)({
		Complete: (result) => {
			match(result)({
				Ok: (value) => assertEquals(value, 101),
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
