import { assertEquals, assertInstanceOf } from "@std/assert";
import * as coreMini from "@/src/core/mini/mod.ts";
import * as mini from "../mini/mod.ts";
import { compareNumbers, compareStrings, Equal, Ordering } from "./mod.ts";

Deno.test("Ordering methods chain on main comparisons", () => {
	// Given: two comparisons, the first a tie
	const byAge = compareNumbers(30, 30);

	// When: breaking the tie with a second comparison and reversing it
	const ordering = byAge.andThen(compareStrings("b", "a")).reverse();

	// Then: the chain is a main Ordering with the expected sign
	assertInstanceOf(ordering, Ordering);
	assertEquals(ordering.isLt(), true);
	assertEquals(ordering.toNumber(), -1);
});

Deno.test("main Ordering is an instance of mini Ordering and mini Enum", () => {
	// Given: a main Equal
	const ordering = Equal();

	// When: checking it against the mini classes
	const classes = [
		ordering instanceof Ordering,
		ordering instanceof mini.Ordering,
		ordering instanceof coreMini.Enum,
	];

	// Then: it is all of them, so mini functions accept it
	assertEquals(classes, [true, true, true]);
	assertEquals(mini.isEq(ordering), true);
});
