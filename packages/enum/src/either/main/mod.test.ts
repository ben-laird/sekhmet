import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	unreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Option } from "@/src/option/main/mod.ts";
import * as optionMini from "@/src/option/mini/mod.ts";
import { Result } from "@/src/result/main/mod.ts";
import * as resultMini from "@/src/result/mini/mod.ts";
import * as mini from "../mini/mod.ts";
import { Either, Left, Right } from "./mod.ts";

Deno.test("Either methods chain on main constructors", () => {
	// Given: a main Left and a main Right
	const left = Left<number, string>(2);
	const right = Right<number, string>("abc");

	// When: chaining transformations on each
	const fromLeft = left
		.mapLeft((n) => n + 1)
		.leftAndThen((n) => (n > 2 ? Left(n * 2) : Right("small")))
		.leftOr(0);
	// {}
	const fromRight = right
		.mapRight((s) => s.toUpperCase())
		.flip()
		.unwrapLeft();
	// {}

	// Then: every step ran
	assertEquals(fromLeft, 6);
	assertEquals(fromRight, "ABC");
});

Deno.test("main Either is an instance of mini Either and mini Enum", () => {
	// Given: a main Left
	const value = Left(1);

	// When: checking it against the mini classes
	const classes = [
		value instanceof Either,
		value instanceof mini.Either,
		value instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrapLeft(value), 1);
});

Deno.test("Either.left and Either.right return main Options", () => {
	// Given: a main Left
	const value = Left<number, string>(3);

	// When: projecting each side to an Option
	const left = value.left().map((n) => n * 2);
	const right = value.right();

	// Then: the projections are main Options
	assertInstanceOf(left, Option);
	assertInstanceOf(right, Option);
	assertEquals(left.unwrap(), 6);
	assertEquals(right.isNone(), true);
});

Deno.test("Either.either and Either.intoInner collapse to one value", () => {
	// Given: a main Left and a main Right
	const left = Left<number, string>(1);
	const right = Right<number, string>("a");

	// When: collapsing them
	const described = [left, right].map((value) => {
		return value.either({
			onLeft: (n) => `number ${n}`,
			onRight: (s) => `text ${s}`,
		});
	});
	const inner = right.intoInner();

	// Then: each side's handler ran, and intoInner gave a plain union
	assertEquals(described, ["number 1", "text a"]);
	assertEquals(inner, "a");
	assertType<IsExact<typeof inner, number | string>>(true);
});

Deno.test("Either.map exists only for an Either whose sides share a type", async (t) => {
	await t.step("same type", () => {
		// Given: an Either of numbers on both sides
		const value: Either<number, number> = Right(2);

		// When: mapping it
		const mapped = value.map((n) => n * 10);

		// Then: it is a main Either on the same side
		assertInstanceOf(mapped, Either);
		assertEquals(mapped.unwrapRight(), 20);
	});

	await t.step("different types", () => {
		// Given: an Either of a number or a string
		const value = Left<number, string>(1);

		// When: mapping it with a function of numbers alone
		// @ts-expect-error: map's mapping takes either side's value
		const misuse = (): unknown => value.map((n: number) => n + 1);

		// Then: it doesn't compile, so it is never called
		assertEquals(typeof misuse, "function");
	});
});

Deno.test("Either.factorNone exists only for an Either of Options", () => {
	// Given: an Either of Options, and an Either of numbers
	const options = Left<optionMini.Option<number>, optionMini.Option<string>>(
		optionMini.Some(1),
	);
	const plain = Left<number, string>(1);

	// When: factoring the None out
	const factored = options.factorNone();
	// @ts-expect-error: factorNone's this is an Either of Options
	const misuse = (): unknown => plain.factorNone();

	// Then: it returns a main Option of a main Either; the misuse doesn't compile
	assertInstanceOf(factored, Option);
	assertInstanceOf(factored.unwrap(), Either);
	assertEquals(factored.unwrap().unwrapLeft(), 1);
	assertEquals(typeof misuse, "function");
});

Deno.test("Either.factorOk keeps two error sources apart in a main Result", () => {
	// Given: an Either of Results sharing a success type
	const value = Right<
		resultMini.Result<number, string>,
		resultMini.Result<number, Error>
	>(resultMini.Err(new Error("io")));

	// When: factoring the success out
	const factored = value.factorOk();

	// Then: it is a main Result whose error is a main Either
	assertInstanceOf(factored, Result);
	const error = factored.unwrapErr();
	assertInstanceOf(error, Either);
	assertEquals(error.unwrapRight().message, "io");
	assertType<IsExact<typeof factored, Result<number, Either<string, Error>>>>(
		true,
	);
});

Deno.test("Either.factorFirst returns a main Either in its pair", () => {
	// Given: an Either of pairs sharing a first element
	const value = Left<[string, number], [string, boolean]>(["id", 1]);

	// When: factoring the first element out
	const [shared, rest] = value.factorFirst();

	// Then: the rest is a main Either
	assertEquals(shared, "id");
	assertInstanceOf(rest, Either);
	assertEquals(rest.unwrapLeft(), 1);
});

Deno.test("Either.isLeftAnd narrows a main Either", () => {
	// Given: a main Either of unknown on the left
	const value: Either<unknown, number> = Left("hello");

	// When: guarding with a string predicate
	assert(value.isLeftAnd((v): v is string => typeof v === "string"));

	// Then: only a Left arm is needed
	const shout = coreMini.match(value)({ Left: (v) => v.toUpperCase() });
	assertEquals(shout, "HELLO");
});

Deno.test("Either.isLeftOr and Either.isRightOr don't narrow", async (t) => {
	await t.step("isLeftOr", () => {
		// Given: a main Right whose value passes the predicate
		const value: Either<number, string> = Right("ab");

		// When: isLeftOr holds
		if (!value.isLeftOr((s) => s.length < 3)) unreachable();

		// Then: the value may still be Right, so it isn't a Left-only Either
		// @ts-expect-error: isLeftOr is not a type guard
		const narrowed: Either<number, never> = value;
		assertEquals(narrowed.unwrapRight(), "ab");
	});

	await t.step("isRightOr", () => {
		// Given: a main Left whose value passes the predicate
		const value: Either<number, string> = Left(1);

		// When: isRightOr holds
		if (!value.isRightOr((n) => n > 0)) unreachable();

		// Then: the value may still be Left, so it isn't a Right-only Either
		// @ts-expect-error: isRightOr is not a type guard
		const narrowed: Either<never, string> = value;
		assertEquals(narrowed.unwrapLeft(), 1);
	});
});

Deno.test("a failed boolean-predicate Either.isLeftAnd keeps both sides", () => {
	// Given: a main Left whose value fails the predicate
	const value: Either<number, string> = Left(1);

	// When: isLeftAnd fails
	if (value.isLeftAnd((n) => n > 40)) unreachable();

	// Then: the else branch is still the whole main Either, not never
	assertType<IsExact<typeof value, Either<number, string>>>(true);
	assertEquals(value.unwrapLeft(), 1);
});

Deno.test("Either.inspectLeft and inspectRight chain on the same main Either", () => {
	// Given: a main Left and a call log
	const value = Left<number, string>(2);
	const seen: string[] = [];

	// When: inspecting both sides in a chain
	const chained = value
		.inspectLeft((n) => seen.push(`left ${n}`))
		.inspectRight((s) => seen.push(`right ${s}`));
	// {}

	// Then: only the Left was seen, and the chain returned the same instance
	assertEquals(seen, ["left 2"]);
	assertStrictEquals(chained, value);
});

Deno.test("Either.mapLeftOr and mapRightOr fall back on the other side", () => {
	// Given: a main Left
	const value = Left<number, string>(2);

	// When: mapping each side with a fallback
	const values = [
		value.mapLeftOr({ fallback: 0, mapping: (n) => n * 10 }),
		value.mapRightOr({ fallback: 0, mapping: (s) => s.length }),
	];

	// Then: its own side is mapped; the other side gives the fallback
	assertEquals(values, [20, 0]);
});
