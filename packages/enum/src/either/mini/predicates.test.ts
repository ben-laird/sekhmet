import { assert, assertEquals, assertFalse } from "@std/assert";
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
		if (!TestSubject.isLeft(value)) throw new Error("expected Left");

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
		if (!TestSubject.isRight(value)) throw new Error("expected Right");

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
		if (
			!TestSubject.isLeftAnd(value, (v): v is string => typeof v === "string")
		) {
			throw new Error("expected a Left string");
		}

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
		if (!TestSubject.isRightAnd(value, (e): e is Timeout => "ms" in e)) {
			throw new Error("expected a Right Timeout");
		}

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
