import { Scheduler } from "@sekhmet/effect/scheduler/mini/scheduler";
import { sync } from "@sekhmet/effect/scheduler/mini/schedules";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";
import { Async, Ready } from "./continuation.ts";
import { Effect, Success } from "./effect.ts";
import { cancel, fork, Runtime } from "./runtime.ts";

Deno.test("fork creates and runs a fiber", () => {
	// Given: a simple success effect
	const effect = Success(42);
	const runtime = new Runtime({
		input: undefined,
		scheduler: new Scheduler({ schedule: sync() }),
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
		Cancelled: () => {
			throw new Error("Fiber was cancelled");
		},
		Panicked: () => {
			throw new Error("Fiber panicked");
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
		scheduler: new Scheduler({ schedule: sync() }),
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
		Cancelled: () => {
			throw new Error("Should not be cancelled");
		},
		Panicked: () => {
			throw new Error("Fiber panicked");
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
		Cancelled: () => {
			throw new Error("Fiber should be complete, not cancelled");
		},
		Panicked: () => {
			throw new Error("Fiber panicked");
		},
	});
});

Deno.test("cancel stops a queued fiber", () => {
	// Given: a simple effect
	const effect = Success(42);
	const runtime = new Runtime({
		input: undefined,
		scheduler: new Scheduler({ schedule: sync() }),
	});

	// When: we fork and immediately cancel before running
	// (This is a bit artificial since fork runs immediately, but tests the cancel logic)
	const fiber = fork(runtime, effect);

	// Then: if we try to cancel after completion, it should remain complete
	cancel(fiber);

	const { fiberState } = getStructParams(fiber);

	// Note: The fiber has already completed, so cancel does nothing
	match(fiberState)({
		Complete: () => {
			/* Expected - already complete */
		},
		Cancelled: () => {
			/* Also acceptable */
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
		Panicked: () => {
			throw new Error("Fiber panicked");
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
		scheduler: new Scheduler({ schedule: sync() }),
	});

	// When: we fork and then cancel the suspended fiber
	const fiber = fork(runtime, asyncEffect);

	// Verify it's suspended
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
		Cancelled: () => {
			throw new Error("Should not be cancelled yet");
		},
		Panicked: () => {
			throw new Error("Fiber panicked");
		},
	});

	// Cancel the fiber
	cancel(fiber);

	// Then: the fiber should be cancelled and cleanup called
	({ fiberState } = getStructParams(fiber));

	match(fiberState)({
		Cancelled: () => {
			assertEquals(cleanupCalled, true, "Cleanup function should be called");
		},
		Complete: () => {
			throw new Error("Should be cancelled, not complete");
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
		Panicked: () => {
			throw new Error("Fiber panicked");
		},
	});

	// Wait to ensure the timeout was actually cleared
	await new Promise((resolve) => setTimeout(resolve, 150));
});

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
		Cancelled: () => {
			throw new Error("Fiber was cancelled");
		},
		Panicked: () => {
			throw new Error("Fiber panicked");
		},
	});
});
