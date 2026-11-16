import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
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
import * as TestSubject from "@/src/effect/mini/operations.ts";
import { fork } from "@/src/execution/mod.ts";
import { join } from "@/src/fiber/mini/fiber.ts";
import {
	Failed,
	type FiberResult,
	Panicked,
} from "@/src/fiber/mini/fiber-error.ts";
import { Runtime } from "@/src/runtime/runtime.ts";
import { Scheduler } from "@/src/scheduler/scheduler.ts";
import { sync } from "@/src/scheduler/schedules.ts";

// --- harness ---

/** Runs an input-free effect on a synchronous runtime. */
function run<T, E>(effect: Effect<void, T, E>): FiberResult<T, E> {
	return runWith(effect, undefined);
}

/** Runs an effect with an input on a synchronous runtime and returns its settled result. */
function runWith<I, T, E>(
	effect: Effect<I, T, E>,
	input: I,
): FiberResult<T, E> {
	const runtime = new Runtime({
		input,
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

/** Runs an effect whose source settles later, returning a probe for its result. */
function runLater<T, E>(
	effect: Effect<void, T, E>,
): () => FiberResult<T, E> | undefined {
	const runtime = new Runtime({
		input: undefined,
		config: { scheduler: new Scheduler({ schedule: sync() }) },
	});
	let outcome: FiberResult<T, E> | undefined;
	join(fork(runtime, effect), (result) => {
		outcome = result;
	});
	return () => outcome;
}

/** An Async source effect settled by the test after forking. */
function deferredSource<T, E>(): {
	effect: Effect<void, T, E>;
	settle: (result: EffectResult<T, E>) => void;
} {
	let resolver: ((c: Continuation<EffectResult<T, E>>) => void) | undefined;
	return {
		effect: new Effect(() =>
			Async((resolve) => {
				resolver = resolve;
			}),
		),
		settle: (result) => resolver?.(Ready(result)),
	};
}

/** A source effect that settles with an untyped exception. */
function excepting<T, E>(exception: unknown): Effect<void, T, E> {
	return new Effect(() => Ready(Err(ExceptionOccurred(exception))));
}

const succeed = <T>(value: T): Effect<void, T, string> => Success(value);
const fail = <T = number>(error: string): Effect<void, T, string> =>
	Failure(error);

const boom = new Error("boom");

/** The three ways a source can settle, for law and table tests. */
const SOURCES: [string, Effect<void, number, string>][] = [
	["Success(0)", succeed(0)],
	["Success(7)", succeed(7)],
	["Success(-3)", succeed(-3)],
	["Failure", fail("bad")],
	["exception", excepting(boom)],
];

// --- map ---

Deno.test("map() transforms the success value", () => {
	// Given: a successful effect
	// When: mapping it
	const result = run(TestSubject.map(succeed(5), (n) => n * 2));

	// Then: the mapped value
	assertEquals(result, Ok(10));
});

Deno.test("map() passes failures and exceptions through untouched", async (t) => {
	await t.step("Failure", () => {
		// Given: a failing effect and a tracking mapping
		let called = false;

		// When: mapping it
		const result = run(
			TestSubject.map(fail("bad"), (n) => {
				called = true;
				return n;
			}),
		);

		// Then: the failure is preserved and the mapping never ran
		assertEquals(result, Err(Failed("bad")));
		assertEquals(called, false);
	});

	await t.step("exception", () => {
		// Given: an effect that settles with an exception
		// When: mapping it
		const result = run(
			TestSubject.map(excepting<number, string>(boom), (n) => n),
		);

		// Then: the exception surfaces as a panic
		assertEquals(result, Err(Panicked(boom)));
	});
});

Deno.test("map() captures a throwing mapping as a panic", () => {
	// Given: a successful effect and a throwing mapping
	// When: mapping it
	const result = run(
		TestSubject.map(succeed(1), () => {
			throw boom;
		}),
	);

	// Then: the fiber panics with the thrown value
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("map() waits for an async source", () => {
	// Given: a mapped effect over a source that settles later
	const source = deferredSource<number, string>();
	const probe = runLater(TestSubject.map(source.effect, (n) => n + 1));
	const before = probe();

	// When: the source settles
	source.settle(Ok(41));

	// Then: the mapped value arrives only then
	assertEquals(before, undefined);
	assertEquals(probe(), Ok(42));
});

Deno.test("map() obeys the functor laws", async (t) => {
	const f = (n: number) => n + 1;
	const g = (n: number) => `${n}`;

	for (const [label, effect] of SOURCES) {
		await t.step(`identity on ${label}`, () => {
			// Given: an effect
			// When: mapping with identity
			const mapped = run(TestSubject.map(effect, (x) => x));

			// Then: the result equals the unmapped effect's
			assertEquals(mapped, run(effect));
		});

		await t.step(`composition on ${label}`, () => {
			// Given: an effect
			// When: mapping in two steps versus once
			const twoSteps = run(TestSubject.map(TestSubject.map(effect, f), g));
			const oneStep = run(TestSubject.map(effect, (x) => g(f(x))));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		});
	}
});

// --- mapOr ---

Deno.test("mapOr() maps success or substitutes the default on failure", async (t) => {
	await t.step("Success", () => {
		// Given: a successful effect
		// When: mapping with a default
		const result = run(TestSubject.mapOr(succeed(3), 0, (n) => n * n));

		// Then: the mapped value
		assertEquals(result, Ok(9));
	});

	await t.step("Failure", () => {
		// Given: a failing effect
		// When: mapping with a default
		const result = run(TestSubject.mapOr(fail("bad"), -1, (n) => n));

		// Then: the default, as a success
		assertEquals(result, Ok(-1));
	});

	await t.step("throwing mapping", () => {
		// Given: a successful effect and a throwing mapping
		// When: mapping with a default
		const result = run(
			TestSubject.mapOr(succeed(1), 0, () => {
				throw boom;
			}),
		);

		// Then: the fiber panics
		assertEquals(result, Err(Panicked(boom)));
	});
});

// --- mapOrElse ---

Deno.test("mapOrElse() folds both arms into a success", async (t) => {
	const arms = {
		Ok: (n: number) => `ok:${n}`,
		Err: (e: string) => `err:${e}`,
	};

	await t.step("Success", () => {
		// Given: a successful effect
		// When: folding
		const result = run(TestSubject.mapOrElse(succeed(4), arms));

		// Then: the Ok arm's output
		assertEquals(result, Ok("ok:4"));
	});

	await t.step("Failure", () => {
		// Given: a failing effect
		// When: folding
		const result = run(TestSubject.mapOrElse(fail("bad"), arms));

		// Then: the Err arm's output, as a success
		assertEquals(result, Ok("err:bad"));
	});

	await t.step("exception bypasses both arms", () => {
		// Given: an effect that settles with an exception
		// When: folding
		const result = run(
			TestSubject.mapOrElse(excepting<number, string>(boom), arms),
		);

		// Then: the exception still surfaces as a panic
		assertEquals(result, Err(Panicked(boom)));
	});

	await t.step("throwing arm", () => {
		// Given: a failing effect and a throwing Err arm
		// When: folding
		const result = run(
			TestSubject.mapOrElse(fail("bad"), {
				Ok: (n) => n,
				Err: () => {
					throw boom;
				},
			}),
		);

		// Then: the fiber panics
		assertEquals(result, Err(Panicked(boom)));
	});
});

// --- mapError ---

Deno.test("mapError() transforms only the typed error", async (t) => {
	await t.step("Failure", () => {
		// Given: a failing effect
		// When: mapping the error
		const result = run(TestSubject.mapError(fail("abc"), (e) => e.length));

		// Then: the mapped error
		assertEquals(result, Err(Failed(3)));
	});

	await t.step("Success", () => {
		// Given: a successful effect
		// When: mapping the error
		const result = run(TestSubject.mapError(succeed(1), (e) => e.length));

		// Then: the success is preserved
		assertEquals(result, Ok(1));
	});

	await t.step("exception", () => {
		// Given: an effect settling with an exception, and a tracking mapping
		let called = false;

		// When: mapping the error
		const result = run(
			TestSubject.mapError(excepting<number, string>(boom), (e) => {
				called = true;
				return e;
			}),
		);

		// Then: the exception passes through without the mapping
		assertEquals(result, Err(Panicked(boom)));
		assertEquals(called, false);
	});

	await t.step("throwing mapping", () => {
		// Given: a failing effect and a throwing mapping
		// When: mapping the error
		const result = run(
			TestSubject.mapError(fail("bad"), () => {
				throw boom;
			}),
		);

		// Then: the fiber panics
		assertEquals(result, Err(Panicked(boom)));
	});
});

Deno.test("mapError() obeys the functor laws on the error channel", async (t) => {
	const f = (e: string) => e.length;
	const g = (n: number) => n * 10;

	for (const [label, effect] of SOURCES) {
		await t.step(`identity on ${label}`, () => {
			// Given: an effect
			// When: mapping the error with identity
			const mapped = run(TestSubject.mapError(effect, (e) => e));

			// Then: the result equals the unmapped effect's
			assertEquals(mapped, run(effect));
		});

		await t.step(`composition on ${label}`, () => {
			// Given: an effect
			// When: mapping the error in two steps versus once
			const twoSteps = run(
				TestSubject.mapError(TestSubject.mapError(effect, f), g),
			);
			const oneStep = run(TestSubject.mapError(effect, (e) => g(f(e))));

			// Then: both agree
			assertEquals(twoSteps, oneStep);
		});
	}
});

// --- inspect / inspectError / inspectException ---

Deno.test("inspect family observes exactly its own channel and preserves the result", async (t) => {
	for (const [label, effect] of SOURCES) {
		await t.step(label, () => {
			// Given: an effect and recorders for each channel
			const seen: string[] = [];

			// When: inspecting all three channels
			const inspected = TestSubject.inspectException(
				TestSubject.inspectError(
					TestSubject.inspect(effect, (v) => seen.push(`value:${v}`)),
					(e) => seen.push(`error:${e}`),
				),
				(x) => seen.push(`exception:${x === boom}`),
			);
			const result = run(inspected);

			// Then: the result is unchanged and exactly one channel was observed
			assertEquals(result, run(effect));
			assertEquals(seen.length, 1);
		});
	}
});

Deno.test("inspect() sees the success value", () => {
	// Given: a successful effect and a recorder
	const seen: number[] = [];

	// When: inspecting it
	const result = run(TestSubject.inspect(succeed(5), (n) => seen.push(n)));

	// Then: the value was observed and preserved
	assertEquals(seen, [5]);
	assertEquals(result, Ok(5));
});

Deno.test("inspectError() sees the typed error", () => {
	// Given: a failing effect and a recorder
	const seen: string[] = [];

	// When: inspecting the error
	const result = run(
		TestSubject.inspectError(fail("bad"), (e) => seen.push(e)),
	);

	// Then: the error was observed and preserved
	assertEquals(seen, ["bad"]);
	assertEquals(result, Err(Failed("bad")));
});

Deno.test("inspectException() sees the thrown exception", () => {
	// Given: an effect settling with an exception, and a recorder
	const seen: unknown[] = [];

	// When: inspecting the exception
	const result = run(
		TestSubject.inspectException(excepting<number, string>(boom), (x) =>
			seen.push(x),
		),
	);

	// Then: the exception was observed and preserved
	assertEquals(seen, [boom]);
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("a throwing inspector turns the result into a panic", async (t) => {
	const other = new Error("inspector failed");
	const throwOther = () => {
		throw other;
	};

	await t.step("inspect", () => {
		// Given: a successful effect with a throwing inspector
		// When: running it
		const result = run(TestSubject.inspect(succeed(1), throwOther));

		// Then: the inspector's exception wins
		assertEquals(result, Err(Panicked(other)));
	});

	await t.step("inspectError", () => {
		// Given: a failing effect with a throwing inspector
		// When: running it
		const result = run(TestSubject.inspectError(fail("bad"), throwOther));

		// Then: the inspector's exception wins
		assertEquals(result, Err(Panicked(other)));
	});

	await t.step("inspectException", () => {
		// Given: an exception-settling effect with a throwing inspector
		// When: running it
		const result = run(
			TestSubject.inspectException(excepting<number, string>(boom), throwOther),
		);

		// Then: the inspector's exception replaces the original
		assertEquals(result, Err(Panicked(other)));
	});
});

// --- and ---

Deno.test("and() feeds the first success into the second effect", () => {
	// Given: an effect and a next step that reads its input
	const double = new Effect<number, number, string>((n) => Ready(Ok(n * 2)));

	// When: sequencing them
	const result = run(TestSubject.and(succeed(21), double));

	// Then: the next step received the first value
	assertEquals(result, Ok(42));
});

Deno.test("and() short-circuits on failure and exception", async (t) => {
	for (const [label, first, expected] of [
		["Failure", fail("bad"), Err(Failed("bad"))],
		["exception", excepting<number, string>(boom), Err(Panicked<string>(boom))],
	] as const) {
		await t.step(label, () => {
			// Given: a non-successful first effect and a tracked next step
			let called = false;
			const next = new Effect<number, number, string>((n) => {
				called = true;
				return Ready(Ok(n));
			});

			// When: sequencing them
			const result = run(TestSubject.and(first, next));

			// Then: the first outcome passes through and next never runs
			assertEquals(result, expected);
			assertEquals(called, false);
		});
	}
});

Deno.test("and() propagates the second effect's failure", () => {
	// Given: a success followed by a failing step
	const next = new Effect<number, number, string>(() =>
		Ready(Err(ExceptionOccurred(boom))),
	);

	// When: sequencing them
	const result = run(TestSubject.and(succeed(1), next));

	// Then: the second outcome is the result
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("and() captures a throwing next step as a panic", () => {
	// Given: a next step that throws when invoked
	const next = new Effect<number, number, string>(() => {
		throw boom;
	});

	// When: sequencing
	const result = run(TestSubject.and(succeed(1), next));

	// Then: the fiber panics
	assertEquals(result, Err(Panicked(boom)));
});

// --- andThen ---

Deno.test("andThen() chains a computed effect sharing the original input", () => {
	// Given: an effect reading its input, and a continuation also reading it
	const readInput = new Effect<string, string, never>((input) =>
		Ready(Ok(input)),
	);
	const chained = TestSubject.andThen(
		readInput,
		(first) =>
			new Effect<string, string, never>((input) =>
				Ready(Ok(`${first}+${input}`)),
			),
	);

	// When: running with an input
	const result = runWith(chained, "in");

	// Then: both steps saw the same input
	assertEquals(result, Ok("in+in"));
});

Deno.test("andThen() short-circuits on failure and exception", async (t) => {
	for (const [label, first, expected] of [
		["Failure", fail("bad"), Err(Failed("bad"))],
		["exception", excepting<number, string>(boom), Err(Panicked<string>(boom))],
	] as const) {
		await t.step(label, () => {
			// Given: a non-successful first effect and a tracked continuation
			let called = false;

			// When: chaining
			const result = run(
				TestSubject.andThen(first, (n) => {
					called = true;
					return succeed(n);
				}),
			);

			// Then: the first outcome passes through and the continuation never runs
			assertEquals(result, expected);
			assertEquals(called, false);
		});
	}
});

Deno.test("andThen() captures a throwing continuation as a panic", () => {
	// Given: a continuation that throws instead of returning an effect
	// When: chaining
	const result = run(
		TestSubject.andThen(succeed(1), (): Effect<void, number, string> => {
			throw boom;
		}),
	);

	// Then: the fiber panics
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("andThen() waits for an async first step", () => {
	// Given: a chain over a source that settles later
	const source = deferredSource<number, string>();
	const probe = runLater(
		TestSubject.andThen(source.effect, (n) => succeed(n * 3)),
	);
	const before = probe();

	// When: the source settles
	source.settle(Ok(3));

	// Then: the chained value arrives only then
	assertEquals(before, undefined);
	assertEquals(probe(), Ok(9));
});

Deno.test("andThen() obeys the monad laws (Success as unit)", async (t) => {
	const f = (n: number): Effect<void, number, string> =>
		n >= 0 ? succeed(n * 2) : fail("negative");
	const g = (n: number): Effect<void, number, string> =>
		n < 10 ? succeed(n + 1) : fail("too big");

	await t.step("left identity: andThen(Success(a), f) ≡ f(a)", () => {
		for (const a of [0, 1, -1, 7, 100]) {
			// Given: a plain value a
			// When: lifting then chaining f
			const result = run(TestSubject.andThen(succeed(a), f));

			// Then: it equals running f(a)
			assertEquals(result, run(f(a)));
		}
	});

	for (const [label, m] of SOURCES) {
		await t.step(`right identity on ${label}: andThen(m, Success) ≡ m`, () => {
			// Given: an effect m
			// When: chaining with Success
			const result = run(TestSubject.andThen(m, succeed));

			// Then: it equals m
			assertEquals(result, run(m));
		});

		await t.step(`associativity on ${label}`, () => {
			// Given: an effect m and continuations f, g
			// When: associating left versus right
			const left = run(TestSubject.andThen(TestSubject.andThen(m, f), g));
			const right = run(
				TestSubject.andThen(m, (x) => TestSubject.andThen(f(x), g)),
			);

			// Then: both agree
			assertEquals(left, right);
		});
	}
});

// --- or ---

Deno.test("or() feeds the typed error into the fallback effect", () => {
	// Given: a failing effect and a fallback that reads the error
	const recover = new Effect<string, number, string>((e) =>
		Ready(Ok(e.length)),
	);

	// When: combining them
	const result = run(TestSubject.or(fail("abcd"), recover));

	// Then: the fallback received the error
	assertEquals(result, Ok(4));
});

Deno.test("or() does not run the fallback on success or exception", async (t) => {
	for (const [label, first, expected] of [
		["Success", succeed(1), Ok(1)],
		["exception", excepting<number, string>(boom), Err(Panicked<string>(boom))],
	] as const) {
		await t.step(label, () => {
			// Given: a non-failing first effect and a tracked fallback
			let called = false;
			const fallback = new Effect<string, number, string>(() => {
				called = true;
				return Ready(Ok(0));
			});

			// When: combining them
			const result = run(TestSubject.or(first, fallback));

			// Then: the first outcome stands and the fallback never runs
			assertEquals(result, expected);
			assertEquals(called, false);
		});
	}
});

Deno.test("or() propagates the fallback's own failure", () => {
	// Given: a failing effect and a failing fallback
	const fallback = new Effect<string, number, number>((e) =>
		Ready(Err(ExceptionOccurred(e))),
	);

	// When: combining them
	const result = run(TestSubject.or(fail("first"), fallback));

	// Then: the fallback's outcome is the result
	assertEquals(result, Err(Panicked("first")));
});

// --- orElse ---

Deno.test("orElse() recovers via a computed effect sharing the original input", () => {
	// Given: an effect failing with a typed error, and a recovery reading the input
	const failing = new Effect<string, string, string>(() =>
		Ready(Err(EffectFailed("bad"))),
	);
	const recover = (e: string) =>
		new Effect<string, string, string>((input) => Ready(Ok(`${e}@${input}`)));

	// When: running the recovered effect with an input
	const result = runWith(TestSubject.orElse(failing, recover), "in");

	// Then: the recovery saw both the error and the original input
	assertEquals(result, Ok("bad@in"));
});

Deno.test("orElse() does not run the recovery on success or exception", async (t) => {
	for (const [label, first, expected] of [
		["Success", succeed(1), Ok(1)],
		["exception", excepting<number, string>(boom), Err(Panicked<string>(boom))],
	] as const) {
		await t.step(label, () => {
			// Given: a non-failing first effect and a tracked recovery
			let called = false;

			// When: recovering
			const result = run(
				TestSubject.orElse(first, () => {
					called = true;
					return succeed(0);
				}),
			);

			// Then: the first outcome stands and the recovery never runs
			assertEquals(result, expected);
			assertEquals(called, false);
		});
	}
});

Deno.test("orElse() captures a throwing recovery as a panic", () => {
	// Given: a recovery that throws instead of returning an effect
	// When: recovering a failure
	const result = run(
		TestSubject.orElse(fail("bad"), (): Effect<void, number, string> => {
			throw boom;
		}),
	);

	// Then: the fiber panics
	assertEquals(result, Err(Panicked(boom)));
});

Deno.test("orElse() obeys the monad laws on the error channel (Failure as unit)", async (t) => {
	const f = (e: string): Effect<void, number, string> =>
		e === "" ? succeed(0) : fail(`${e}!`);
	const g = (e: string): Effect<void, number, string> =>
		e.length > 4 ? succeed(e.length) : fail(e.toUpperCase());

	await t.step("left identity: orElse(Failure(e), f) ≡ f(e)", () => {
		for (const e of ["", "a", "boom"]) {
			// Given: an error value e
			// When: lifting then recovering with f
			const result = run(TestSubject.orElse(fail(e), f));

			// Then: it equals running f(e)
			assertEquals(result, run(f(e)));
		}
	});

	for (const [label, m] of SOURCES) {
		await t.step(`right identity on ${label}: orElse(m, Failure) ≡ m`, () => {
			// Given: an effect m
			// When: recovering with Failure
			const result = run(TestSubject.orElse(m, (e) => fail(e)));

			// Then: it equals m
			assertEquals(result, run(m));
		});

		await t.step(`associativity on ${label}`, () => {
			// Given: an effect m and recoveries f, g
			// When: associating left versus right
			const left = run(TestSubject.orElse(TestSubject.orElse(m, f), g));
			const right = run(
				TestSubject.orElse(m, (e) => TestSubject.orElse(f(e), g)),
			);

			// Then: both agree
			assertEquals(left, right);
		});
	}
});
