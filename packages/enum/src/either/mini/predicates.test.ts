import { assert, assertEquals, assertFalse, unreachable } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { match, union } from "@/src/core/mini/exit.ts";
import { type Either, Left, Right } from "@/src/either/mini/core.ts";
import * as TestSubject from "@/src/either/mini/predicates.ts";

Deno.test("isLeft() and isRight() are complementary", async (t) => {
	const cases: [string, Either<number, string>, boolean][] = [
		["Left", Left(1), true],
		["Right", Right("a"), false],
	];

	for (const [label, value, expectLeft] of cases) {
		await t.step(label, () => {
			// Given: an Either of a known variant
			// When: checking both predicates
			const isLeft = TestSubject.isLeft(value);
			const isRight = TestSubject.isRight(value);

			// Then: exactly one holds
			assertEquals(isLeft, expectLeft);
			assertEquals(isRight, !expectLeft);
		});
	}
});

Deno.test("isLeft() and isRight() narrow variant and type parameters", async (t) => {
	await t.step("isLeft", () => {
		// Given: an Either typed as either side
		const value: Either<number, string> = Left(1);

		// When: guarding on isLeft
		assert(TestSubject.isLeft(value));

		// Then: the value reads directly and the right side is never
		const inner = union(value);
		assertType<IsExact<typeof inner, number>>(true);
		const widened: Either<number, boolean> = value;
		assertEquals(widened, Left(1));
	});

	await t.step("isRight", () => {
		// Given: an Either typed as either side
		const value: Either<number, string> = Right("a");

		// When: guarding on isRight
		assert(TestSubject.isRight(value));

		// Then: the value reads directly and the left side is never
		const inner = union(value);
		assertType<IsExact<typeof inner, string>>(true);
		const widened: Either<boolean, string> = value;
		assertEquals(widened, Right("a"));
	});
});

Deno.test("isLeftAnd() requires Left and a passing predicate", async (t) => {
	await t.step("Left and predicate passes", () => {
		// Given: Left(42)
		const value = Left(42);

		// When: checking with a passing predicate
		const subject = TestSubject.isLeftAnd(value, (n) => n > 40);

		// Then: true
		assert(subject);
	});

	await t.step("Left and predicate fails", () => {
		// Given: Left(1)
		const value = Left(1);

		// When: checking with a failing predicate
		const subject = TestSubject.isLeftAnd(value, (n) => n > 40);

		// Then: false
		assertFalse(subject);
	});

	await t.step("Right never calls the predicate", () => {
		// Given: a Right and a tracking predicate
		const value: Either<number, string> = Right("a");
		let called = false;

		// When: checking it
		const subject = TestSubject.isLeftAnd(value, () => {
			called = true;
			return true;
		});

		// Then: false, and the predicate was not consulted
		assertFalse(subject);
		assertFalse(called);
	});

	await t.step("type guard narrows the left value", () => {
		// Given: a Left of unknown
		const value: Either<unknown, number> = Left("hello");

		// When: checking with a string guard
		assert(
			TestSubject.isLeftAnd(value, (v): v is string => typeof v === "string"),
		);

		// Then: only a Left arm is needed, and it holds a string
		const shout = match(value)({ Left: (v) => v.toUpperCase() });
		assertEquals(shout, "HELLO");
	});
});

Deno.test("isRightAnd() requires Right and a passing predicate", async (t) => {
	await t.step("Right and predicate passes", () => {
		// Given: Right("abc")
		const value = Right("abc");

		// When: checking with a passing predicate
		const subject = TestSubject.isRightAnd(value, (s) => s.length === 3);

		// Then: true
		assert(subject);
	});

	await t.step("Left never calls the predicate", () => {
		// Given: a Left and a tracking predicate
		const value: Either<number, string> = Left(1);
		let called = false;

		// When: checking it
		const subject = TestSubject.isRightAnd(value, () => {
			called = true;
			return true;
		});

		// Then: false, and the predicate was not consulted
		assertFalse(subject);
		assertFalse(called);
	});

	await t.step("type guard narrows the right value", () => {
		// Given: a Right of a union
		type Timeout = { ms: number };
		const value: Either<number, Error | Timeout> = Right({ ms: 5 });

		// When: checking with a Timeout guard
		assert(TestSubject.isRightAnd(value, (e): e is Timeout => "ms" in e));

		// Then: only a Right arm is needed, and it holds a Timeout
		const ms = match(value)({ Right: (e) => e.ms });
		assertEquals(ms, 5);
	});
});

Deno.test("isLeftOr() and isRightOr() pass their own side", async (t) => {
	const short = (s: string): boolean => s.length < 3;
	const positive = (n: number): boolean => n > 0;
	const cases: [string, Either<number, string>, boolean, boolean][] = [
		["Left passing", Left(1), true, true],
		["Left failing", Left(-1), true, false],
		["Right passing", Right("ab"), true, true],
		["Right failing", Right("abc"), false, true],
	];

	for (const [label, value, leftOr, rightOr] of cases) {
		await t.step(label, () => {
			// Given: an Either and a predicate per side
			// When: checking isLeftOr and isRightOr
			const subjects = [
				TestSubject.isLeftOr(value, short),
				TestSubject.isRightOr(value, positive),
			];

			// Then: each is true on its own side, else the predicate decides
			assertEquals(subjects, [leftOr, rightOr]);
		});
	}
});

Deno.test("isLeftOr() and isRightOr() don't narrow", async (t) => {
	await t.step("isLeftOr", () => {
		// Given: a Right whose value passes the predicate
		const value: Either<number, string> = Right("ab");

		// When: isLeftOr holds
		if (!TestSubject.isLeftOr(value, (s) => s.length < 3)) unreachable();

		// Then: the value may still be Right, so it isn't a Left-only Either
		// @ts-expect-error: isLeftOr is not a type guard
		const narrowed: Either<number, never> = value;
		assertEquals(narrowed, Right("ab"));
	});

	await t.step("isRightOr", () => {
		// Given: a Left whose value passes the predicate
		const value: Either<number, string> = Left(1);

		// When: isRightOr holds
		if (!TestSubject.isRightOr(value, (n) => n > 0)) unreachable();

		// Then: the value may still be Left, so it isn't a Right-only Either
		// @ts-expect-error: isRightOr is not a type guard
		const narrowed: Either<never, string> = value;
		assertEquals(narrowed, Left(1));
	});
});

Deno.test("a failed boolean-predicate isLeftAnd()/isRightAnd() keeps both sides", async (t) => {
	await t.step("isLeftAnd", () => {
		// Given: a Left whose value fails the predicate
		const value: Either<number, string> = Left(1);

		// When: isLeftAnd fails
		if (TestSubject.isLeftAnd(value, (n) => n > 40)) unreachable();

		// Then: the else branch is still the whole Either, not never
		assertType<IsExact<typeof value, Either<number, string>>>(true);
		assertEquals(union(value), 1);
	});

	await t.step("isRightAnd", () => {
		// Given: a Right whose value fails the predicate
		const value: Either<number, string> = Right("abc");

		// When: isRightAnd fails
		if (TestSubject.isRightAnd(value, (s) => s.length < 3)) unreachable();

		// Then: the else branch is still the whole Either, not never
		assertType<IsExact<typeof value, Either<number, string>>>(true);
		assertEquals(union(value), "abc");
	});
});
