import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { type Either, Left, Right } from "@/src/either/mini/core.ts";
import * as TestSubject from "@/src/either/mini/transform.ts";

const left: Either<number, string> = Left(2);
const right: Either<number, string> = Right("abc");

Deno.test("mapLeft() maps a Left and passes a Right through", () => {
	// Given: a Left and a Right
	// When: mapping the left side
	const mappedLeft = TestSubject.mapLeft(left, (n) => n * 10);
	const mappedRight = TestSubject.mapLeft(right, (n) => n * 10);

	// Then: only the Left changed
	assertEquals(mappedLeft, Left(20));
	assertEquals(mappedRight, Right("abc"));
});

Deno.test("mapRight() maps a Right and passes a Left through", () => {
	// Given: a Left and a Right
	// When: mapping the right side
	const mappedLeft = TestSubject.mapRight(left, (s) => s.length);
	const mappedRight = TestSubject.mapRight(right, (s) => s.length);

	// Then: only the Right changed
	assertEquals(mappedLeft, Left(2));
	assertEquals(mappedRight, Right(3));
});

Deno.test("mapEither() maps each side with its own handler", () => {
	// Given: a handler per side
	const handlers = {
		onLeft: (n: number) => n > 1,
		onRight: (s: string) => s.length,
	};

	// When: mapping a Left and a Right
	const mappedLeft = TestSubject.mapEither(left, handlers);
	const mappedRight = TestSubject.mapEither(right, handlers);

	// Then: each kept its side, mapped by its handler
	assertEquals(mappedLeft, Left(true));
	assertEquals(mappedRight, Right(3));
	assertType<IsExact<typeof mappedLeft, Either<boolean, number>>>(true);
});

Deno.test("map() maps an Either whose sides share a type", () => {
	// Given: Eithers of numbers on both sides
	const sameLeft: Either<number, number> = Left(2);
	const sameRight: Either<number, number> = Right(3);

	// When: mapping them with one function
	const mappedLeft = TestSubject.map(sameLeft, String);
	const mappedRight = TestSubject.map(sameRight, String);

	// Then: the value changed and the side stayed
	assertEquals(mappedLeft, Left("2"));
	assertEquals(mappedRight, Right("3"));
	assertType<IsExact<typeof mappedLeft, Either<string, string>>>(true);
});

Deno.test("either() calls only the handler for its side", () => {
	// Given: tracking handlers
	const calls: string[] = [];
	const handlers = {
		onLeft: (n: number): string => {
			calls.push("left");
			return `n=${n}`;
		},
		onRight: (s: string): string => {
			calls.push("right");
			return `s=${s}`;
		},
	};

	// When: collapsing a Left, then a Right
	const fromLeft = TestSubject.either(left, handlers);
	const fromRight = TestSubject.either(right, handlers);

	// Then: each used its own handler, once
	assertEquals([fromLeft, fromRight], ["n=2", "s=abc"]);
	assertEquals(calls, ["left", "right"]);
});

Deno.test("flip() swaps the sides and is its own inverse", () => {
	// Given: a Left and a Right
	// When: flipping each once and twice
	const once = [TestSubject.flip(left), TestSubject.flip(right)];
	const twice = once.map(TestSubject.flip);

	// Then: once swaps the side keeping the value; twice restores it
	assertEquals(once, [Right(2), Left("abc")]);
	assertEquals(twice, [left, right]);
	assertType<IsExact<(typeof once)[number], Either<string, number>>>(true);
});

Deno.test("intoInner() returns either side's value as a union", () => {
	// Given: a Left and a Right
	// When: taking their inner values
	const values = [TestSubject.intoInner(left), TestSubject.intoInner(right)];

	// Then: each value comes out, typed as the union of the sides
	assertEquals(values, [2, "abc"]);
	assertType<IsExact<(typeof values)[number], number | string>>(true);
});

Deno.test("mapLeftOr() maps a Left and falls back on a Right", () => {
	// Given: a mapping of the left side and a fallback
	const options = { fallback: -1, mapping: (n: number) => n * 10 };

	// When: applying it to a Left and a Right
	const values = [
		TestSubject.mapLeftOr(left, options),
		TestSubject.mapLeftOr(right, options),
	];

	// Then: the Left is mapped; the Right gives the fallback
	assertEquals(values, [20, -1]);
});

Deno.test("mapRightOr() maps a Right and falls back on a Left", () => {
	// Given: a mapping of the right side and a fallback
	const options = { fallback: -1, mapping: (s: string) => s.length };

	// When: applying it to a Left and a Right
	const values = [
		TestSubject.mapRightOr(left, options),
		TestSubject.mapRightOr(right, options),
	];

	// Then: the Right is mapped; the Left gives the fallback
	assertEquals(values, [-1, 3]);
});

Deno.test("inspectLeft() sees a Left only and returns the Either itself", () => {
	// Given: a call log
	const seen: number[] = [];

	// When: inspecting the left side of a Left and a Right
	const fromLeft = TestSubject.inspectLeft(left, (n) => seen.push(n));
	const fromRight = TestSubject.inspectLeft(right, (n) => seen.push(n));

	// Then: only the Left's value was seen, and each call returned its receiver
	assertEquals(seen, [2]);
	assertStrictEquals(fromLeft, left);
	assertStrictEquals(fromRight, right);
});

Deno.test("inspectRight() sees a Right only and returns the Either itself", () => {
	// Given: a call log
	const seen: string[] = [];

	// When: inspecting the right side of a Left and a Right
	const fromLeft = TestSubject.inspectRight(left, (s) => seen.push(s));
	const fromRight = TestSubject.inspectRight(right, (s) => seen.push(s));

	// Then: only the Right's value was seen, and each call returned its receiver
	assertEquals(seen, ["abc"]);
	assertStrictEquals(fromLeft, left);
	assertStrictEquals(fromRight, right);
});
