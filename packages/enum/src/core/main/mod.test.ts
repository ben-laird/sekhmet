import { getStructParams } from "@sekhmet/primordials/struct";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
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
