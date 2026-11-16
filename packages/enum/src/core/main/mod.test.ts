import { getStructParams } from "@sekhmet/primordials/struct";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	unreachable,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as mini from "../mini/mod.ts";
import { Enum } from "./mod.ts";

type Shape = mini.Split<{ Circle: [radius: number]; Square: [side: number] }>;

Deno.test("main Enum is an instance of mini Enum", () => {
	// Given: a main Enum
	const shape = new Enum<Shape>("Circle", 2);

	// When: checking it against both classes
	const isMain = shape instanceof Enum;
	const isMini = shape instanceof mini.Enum;

	// Then: it is both, so it works with every mini function
	assertEquals([isMain, isMini], [true, true]);
	assertEquals(mini.union(shape), 2);
});

Deno.test("main Enum methods narrow and match like their mini functions", () => {
	// Given: a main Enum holding a Square
	const shape: Enum<Shape> = new Enum<Shape>("Square", 3);

	// When: narrowing with a method guard and matching with uncurried match
	const area = shape.match({
		Circle: (radius) => Math.PI * radius ** 2,
		Square: (side) => side ** 2,
	});
	const side = shape.isolate("Square") ? shape.union() : -1;

	// Then: both agree with the variant
	assertEquals(area, 9);
	assertEquals(side, 3);
	assertEquals(shape.unionKinds(), "Square");
});

Deno.test("main isolateAnd() narrows the value to a type-guard predicate", async (t) => {
	type Reading = mini.Split<{ Value: [value: string | number]; Missing: [] }>;

	await t.step("the guarded value is the guarded type", () => {
		// Given: a main Enum whose value may be a string or a number
		const reading: Enum<Reading> = new Enum<Reading>("Value", 42);

		// When: isolating Value with a guard for numbers
		if (
			reading.isolateAnd(
				"Value",
				(value): value is number => typeof value === "number",
			)
		) {
			// Then: only the Value arm is needed, and the value is a number
			const value = reading.union();
			assertType<IsExact<typeof value, number>>(true);
			assertEquals(reading.match({ Value: (n) => n + 1 }), 43);
		} else {
			unreachable();
		}
	});

	await t.step("an unguarded match needs every arm", () => {
		// Given: a main Enum whose value may be a string or a number
		const reading: Enum<Reading> = new Enum<Reading>("Value", 42);

		// When: matching with only the Value arm
		// @ts-expect-error: the Missing arm is missing
		const next = reading.match({ Value: () => 0 });

		// Then: the match is rejected at compile time
		assertEquals(next, 0);
	});

	await t.step("the else-branch is not narrowed", () => {
		// Given: a main Enum holding a string
		const reading: Enum<Reading> = new Enum<Reading>("Value", "high");

		// When: the numeric guard fails
		if (
			reading.isolateAnd(
				"Value",
				(value): value is number => typeof value === "number",
			)
		) {
			unreachable();
		} else {
			// Then: it keeps its declared type
			assertType<IsExact<typeof reading, Enum<Reading>>>(true);
		}
	});
});

Deno.test("Enum.fromMini converts a mini Enum and keeps a main one", () => {
	// Given: a mini Enum and a main Enum
	const miniShape = new mini.Enum<Shape>("Circle", 1);
	const mainShape = new Enum<Shape>("Circle", 1);

	// When: converting both
	const converted = Enum.fromMini(miniShape);
	const kept = Enum.fromMini(mainShape);

	// Then: the mini one becomes main, and the main one is returned unchanged
	assertInstanceOf(converted, Enum);
	assertEquals(converted.union(), 1);
	assertStrictEquals(kept, mainShape);
});

Deno.test("Enum.fromMini shares the mini instance's struct params", () => {
	// Given: a mini Enum
	const miniShape = new mini.Enum<Shape>("Circle", 1);

	// When: converting it to main
	const view = Enum.fromMini(miniShape);

	// Then: both read and write the same state
	assertStrictEquals(getStructParams(view), getStructParams(miniShape));
});

Deno.test("Enum's iterator methods yield main Enums lazily", () => {
	// Given: a main Enum holding a Circle
	const shape = new Enum<Shape>("Circle", 1);

	// When: iterating the Enums that match Circle
	const matches = shape.iterAnyIsolated(new Set(["Circle"] as const));
	const [first] = [...matches];

	// Then: the yielded Enum is the main receiver itself
	assertInstanceOf(first, Enum);
	assertStrictEquals(first, shape);
});
