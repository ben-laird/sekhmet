import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Result } from "@/src/result/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { flatten, None, Option, Some } from "./mod.ts";

Deno.test("Option methods chain on main constructors", () => {
	// Given: a main Some
	const start = Some(21);

	// When: chaining transformations
	const label = start
		.map((n) => n * 2)
		.filter((n) => n > 40)
		.mapOr("none", (n) => `got ${n}`);

	// Then: every step ran
	assertEquals(label, "got 42");
	assertEquals(
		None<number>()
			.map((n) => n + 1)
			.unwrapOr(0),
		0,
	);
});

Deno.test("main Option is an instance of mini Option and mini Enum", () => {
	// Given: a main Some
	const option = Some(1);

	// When: checking it against the mini classes
	const classes = [
		option instanceof Option,
		option instanceof mini.Option,
		option instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(option), 1);
});

Deno.test("Option methods returning Option return main Options", () => {
	// Given: a main Some and a mini None
	const some = Some(2);
	const miniNone = mini.None<number>();

	// When: combining them through methods and wrappers
	const ored = miniNone instanceof Option ? undefined : some.and(miniNone);
	const flat = flatten(Some(Some(3)));

	// Then: results are main Options even when mini returned a mini one
	assertInstanceOf(ored, Option);
	assertInstanceOf(flat, Option);
	assertEquals(flat.unwrap(), 3);
});

Deno.test("Option methods returning self keep its identity", () => {
	// Given: a main Some
	const option = Some(5);
	const seen: number[] = [];

	// When: inspecting it
	const inspected = option.inspect((value) => seen.push(value));

	// Then: the same instance comes back
	assertStrictEquals(inspected, option);
	assertEquals(seen, [5]);
});

Deno.test("Option.okOr returns a main Result", () => {
	// Given: a main Some and a main None
	const some = Some(4);
	const none = None<number>();

	// When: converting them to Results and chaining a Result method
	const ok = some.okOr("missing").map((n) => n * 10);
	const err = none.okOr("missing").mapErr((e) => e.length);

	// Then: the conversions chain as main Results
	assertInstanceOf(ok, Result);
	assertEquals(ok.unwrap(), 40);
	assertEquals(err.unwrapErr(), 7);
});

Deno.test("Option mutating methods mutate the receiver", () => {
	// Given: a main None
	const option = None<number>();

	// When: inserting a value, then taking it back out
	const inserted = option.getOrInsert(7);
	const taken = option.take();

	// Then: the receiver changed in place, and take returned a main Option
	assertEquals(inserted, 7);
	assertInstanceOf(taken, Option);
	assertEquals(taken.unwrap(), 7);
	assertEquals(option.isNone(), true);
});
