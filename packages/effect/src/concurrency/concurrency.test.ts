import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { joinEffect, zip } from "@/src/concurrency/concurrency.ts";
import {
	Async,
	type Continuation,
	Ready,
} from "@/src/continuation/continuation.ts";
import {
	Effect,
	Failed as EffectFailed,
	type EffectResult,
	ExceptionOccurred,
	Failure,
	Success,
} from "@/src/effect/mini/effect.ts";
import { fork } from "@/src/execution/mod.ts";
import { cancel, type Fiber, join } from "@/src/fiber/mini/fiber.ts";
import {
	Cancelled,
	Failed,
	type FiberResult,
	Panicked,
} from "@/src/fiber/mini/fiber-error.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";

// --- harness ---

function forkSync<I, T, E>(effect: Effect<I, T, E>, input: I): Fiber<I, T, E> {
	return fork(
		new Runtime({
			input,
			config: { scheduler: new Scheduler({ schedule: sync() }) },
		}),
		effect,
	);
}

/** Observes a fiber's result as soon as it settles. */
function probe<I, T, E>(
	fiber: Fiber<I, T, E>,
): () => FiberResult<T, E> | undefined {
	let outcome: FiberResult<T, E> | undefined;
	join(fiber, (result) => {
		outcome = result;
	});
	return () => outcome;
}

/** An Async effect the test settles by hand, counting cleanups. */
function controlled<T, E>(): {
	effect: Effect<void, T, E>;
	settle: (result: EffectResult<T, E>) => void;
	cleanups: () => number;
} {
	let resolver: ((c: Continuation<EffectResult<T, E>>) => void) | undefined;
	let cleanupCalls = 0;
	return {
		effect: new Effect(() =>
			Async((resolve) => {
				resolver = resolve;
				return () => {
					cleanupCalls++;
				};
			}),
		),
		settle: (result) => resolver?.(Ready(result)),
		cleanups: () => cleanupCalls,
	};
}

const succeed = <T>(value: T): Effect<void, T, string> => Success(value);
const boom = new Error("boom");

// --- zip ---

Deno.test("zip() pairs two successes as [left, right]", () => {
	// Given: two successful effects
	// When: zipping and running them
	const result = probe(forkSync(zip(succeed(1), succeed("a")), undefined))();

	// Then: the pair, in argument order
	assertEquals(result, Ok([1, "a"]));
});

Deno.test("zip() gives both sides the same input", () => {
	// Given: two effects that read their input
	const left = new Effect<number, number, never>((n) => Ready(Ok(n + 1)));
	const right = new Effect<number, number, never>((n) => Ready(Ok(n * 2)));

	// When: zipping and running with an input
	const result = probe(forkSync(zip(left, right), 10))();

	// Then: each side saw the input
	assertEquals(result, Ok([11, 20]));
});

Deno.test("zip() keeps argument order regardless of completion order", async (t) => {
	for (const order of ["left-first", "right-first"] as const) {
		await t.step(order, () => {
			// Given: two async sides
			const left = controlled<string, string>();
			const right = controlled<string, string>();
			const result = probe(forkSync(zip(left.effect, right.effect), undefined));

			// When: they settle in the given order
			if (order === "left-first") {
				left.settle(Ok("L"));
				right.settle(Ok("R"));
			} else {
				right.settle(Ok("R"));
				left.settle(Ok("L"));
			}

			// Then: the pair is always [left, right]
			assertEquals(result(), Ok(["L", "R"]));
		});
	}
});

Deno.test("zip() waits for both sides", () => {
	// Given: one immediate side and one async side
	const right = controlled<number, string>();
	const result = probe(forkSync(zip(succeed(1), right.effect), undefined));
	const before = result();

	// When: the async side settles
	right.settle(Ok(2));

	// Then: the pair arrives only then
	assertEquals(before, undefined);
	assertEquals(result(), Ok([1, 2]));
});

Deno.test("zip() fails fast with the first typed failure and cancels the other side", () => {
	// Given: a left side that suspends and a right side that fails
	const left = controlled<number, string>();

	// When: zipping and running
	const result = probe(
		forkSync(zip(left.effect, Failure("right failed")), undefined),
	)();

	// Then: the failure surfaces and the suspended side was cleaned up
	assertEquals(result, Err(Failed("right failed")));
	assertEquals(left.cleanups(), 1);
});

Deno.test("zip() never starts a side that is still queued when the other fails", () => {
	// Given: a left side that fails immediately and a right side tracking its start
	let rightStarted = false;
	const right = new Effect<void, number, string>(() => {
		rightStarted = true;
		return Ready(Ok(1));
	});

	// When: zipping and running
	const result = probe(
		forkSync(zip(Failure("left failed"), right), undefined),
	)();

	// Then: the failure surfaces and the right side was cancelled before it ran
	assertEquals(result, Err(Failed("left failed")));
	assertEquals(rightStarted, false);
});

Deno.test("zip() surfaces a side's exception as a panic", () => {
	// Given: a right side settling with an exception
	const right = new Effect<void, number, string>(() =>
		Ready(Err(ExceptionOccurred(boom))),
	);

	// When: zipping and running
	const result = probe(forkSync(zip(succeed(1), right), undefined))();

	// Then: the zip panics with that exception
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("zip() ignores a later outcome once settled", () => {
	// Given: two async sides, the first of which fails
	const left = controlled<number, string>();
	const right = controlled<number, string>();
	const result = probe(forkSync(zip(left.effect, right.effect), undefined));

	// When: the left fails, then the right tries to succeed
	left.settle(Err(ExceptionOccurred(boom)));
	right.settle(Ok(2));

	// Then: the first outcome stands
	assertEquals(result(), Err(Panicked(boom)));
});

// --- joinEffect ---

Deno.test("joinEffect() yields a pending fiber's success once it settles", () => {
	// Given: a fiber suspended on async work, and an effect joining it
	const work = controlled<string, string>();
	const target = forkSync(work.effect, undefined);
	const joined = probe(forkSync(joinEffect(target), undefined));
	const before = joined();

	// When: the work settles
	work.settle(Ok("done"));

	// Then: the joining effect succeeds with the value
	assertEquals(before, undefined);
	assertEquals(joined(), Ok("done"));
});

Deno.test("joinEffect() turns the fiber's error into a typed failure", async (t) => {
	await t.step("Failed", () => {
		// Given: a fiber that will fail with a typed error
		const work = controlled<string, string>();
		const target = forkSync(work.effect, undefined);
		const joined = probe(forkSync(joinEffect(target), undefined));

		// When: the work fails
		work.settle(Err(EffectFailed("bad")));

		// Then: the fiber error is the joiner's typed failure
		assertEquals(joined(), Err(Failed(Failed("bad"))));
	});

	await t.step("Panicked", () => {
		// Given: a fiber that will settle with an exception
		const work = controlled<string, string>();
		const target = forkSync(work.effect, undefined);
		const joined = probe(forkSync(joinEffect(target), undefined));

		// When: the work raises an exception
		work.settle(Err(ExceptionOccurred(boom)));

		// Then: even a panic is surfaced as a typed failure of the joiner
		assertEquals(joined(), Err(Failed(Panicked(boom))));
	});

	await t.step("Cancelled", () => {
		// Given: a pending fiber and an effect joining it
		const work = controlled<string, string>();
		const target = forkSync(work.effect, undefined);
		const joined = probe(forkSync(joinEffect(target), undefined));

		// When: the target is cancelled
		cancel(target);

		// Then: the cancellation is the joiner's typed failure
		assertEquals(joined(), Err(Failed(Cancelled())));
	});
});

Deno.test("cancelling a zip cancels each side exactly once", () => {
	// Given: a zip suspended on two async sides
	const left = controlled<number, string>();
	const right = controlled<number, string>();
	const fiber = forkSync(zip(left.effect, right.effect), undefined);
	const result = probe(fiber);

	// When: cancelling the zip
	cancel(fiber);

	// Then: it is cancelled and each side was cleaned up once
	assertEquals(result(), Err(Cancelled<string>()));
	assertEquals(left.cleanups(), 1);
	assertEquals(right.cleanups(), 1);
});
