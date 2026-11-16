import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import * as coreMini from "@/src/core/mini/mod.ts";
import { Option } from "@/src/option/main/mod.ts";
import { Result } from "@/src/result/main/mod.ts";
import * as mini from "../mini/mod.ts";
import { Active, Inactive, Latch } from "./mod.ts";

Deno.test("Latch methods chain on main constructors", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(2);

	// When: chaining transformations
	const value = latch
		.map((n) => n * 3)
		.mapInactive((reason) => reason.length)
		.unwrapOr(0);

	// Then: every step ran
	assertEquals(value, 6);
	assertEquals(Inactive<number, string>("off").unwrapInactive(), "off");
});

Deno.test("main Latch is an instance of mini Latch and mini Enum", () => {
	// Given: a main Active latch
	const latch = Active(1);

	// When: checking it against the mini classes
	const classes = [
		latch instanceof Latch,
		latch instanceof mini.Latch,
		latch instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.unwrap(latch), 1);
});

Deno.test("Latch mutations return the same main instance", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(1);

	// When: deactivating it through a method
	const returned = latch.deactivate("stopped");

	// Then: the receiver itself changed and came back
	assertStrictEquals(returned, latch);
	assertEquals(latch.isInactive(), true);
	assertEquals(latch.unwrapInactive(), "stopped");
});

Deno.test("Latch conversions return main Options and Results", () => {
	// Given: a main Active latch
	const latch = Active<number, string>(5);

	// When: converting it
	const active = latch.active();
	const result = latch.toResult();

	// Then: the conversions are main types that chain
	assertInstanceOf(active, Option);
	assertInstanceOf(result, Result);
	assertEquals(active.map((n) => n + 1).unwrap(), 6);
	assertEquals(result.map((n) => n * 2).unwrap(), 10);
});

Deno.test("a main view of a mini Latch shares its state", () => {
	// Given: a mini Inactive latch returned through a main method
	const miniLatch = mini.Inactive<number, string>("off");
	const view = Active<number, string>(1).and(miniLatch);

	// When: activating the main view
	view.activate(9);

	// Then: the mini source is Active too
	assertInstanceOf(view, Latch);
	assertEquals(mini.unwrap(miniLatch), 9);
});
