import { Scheduler } from "@sekhmet/effect/scheduler/mini/scheduler";
import { sync } from "@sekhmet/effect/scheduler/mini/schedules";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Ready } from "../../continuation/mini/continuation.ts";
import { fork } from "../../fiber/mini/fiber.ts";
import { Runtime } from "../../runtime/mini/runtime.ts";
import { Effect, Failed, Failure, Success } from "./effect.ts";
import { and, andThen, map, mapError, or, orElse } from "./operations.ts";

Deno.test("map transforms success value", () => {
	// Given: a success effect with value 10
	const effect = Success(10);
	const runtime = new Runtime({
		input: undefined,
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		scheduler: new Scheduler({ schedule: sync() }),
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
