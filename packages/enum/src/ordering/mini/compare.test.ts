import { assertEquals } from "@std/assert";
import { unionKinds } from "@/src/core/mini/exit.ts";
import {
	compareBy,
	compareByString,
	compareNumbers,
	compareStrings,
} from "./compare.ts";

Deno.test("compareNumbers returns Less when lhs < rhs", () => {
	// Given: two numbers where left is smaller

	// When: comparing them
	const result = compareNumbers(1, 2);

	// Then: result is Less
	assertEquals(unionKinds(result), "Less");
});

Deno.test("compareNumbers returns Greater when lhs > rhs", () => {
	// Given: two numbers where left is larger

	// When: comparing them
	const result = compareNumbers(2, 1);

	// Then: result is Greater
	assertEquals(unionKinds(result), "Greater");
});

Deno.test("compareNumbers returns Equal when lhs === rhs", () => {
	// Given: two equal numbers

	// When: comparing them
	const result = compareNumbers(5, 5);

	// Then: result is Equal
	assertEquals(unionKinds(result), "Equal");
});

Deno.test("compareStrings returns Less when lhs < rhs lexicographically", () => {
	// Given: two strings where left comes first alphabetically

	// When: comparing them
	const result = compareStrings("apple", "banana");

	// Then: result is Less
	assertEquals(unionKinds(result), "Less");
});

Deno.test("compareStrings returns Greater when lhs > rhs lexicographically", () => {
	// Given: two strings where left comes after alphabetically

	// When: comparing them
	const result = compareStrings("zebra", "apple");

	// Then: result is Greater
	assertEquals(unionKinds(result), "Greater");
});

Deno.test("compareStrings returns Equal when lhs === rhs", () => {
	// Given: two equal strings

	// When: comparing them
	const result = compareStrings("hello", "hello");

	// Then: result is Equal
	assertEquals(unionKinds(result), "Equal");
});

Deno.test("compareBy extracts numeric key and compares", () => {
	// Given: objects with numeric properties
	interface Person {
		name: string;
		age: number;
	}
	const alice: Person = { name: "Alice", age: 30 };
	const bob: Person = { name: "Bob", age: 25 };

	// When: comparing by age
	const result = compareBy(alice, bob, (p) => p.age);

	// Then: result is Greater (30 > 25)
	assertEquals(unionKinds(result), "Greater");
});

Deno.test("compareByString extracts string key and compares", () => {
	// Given: objects with string properties
	interface Person {
		name: string;
		age: number;
	}
	const alice: Person = { name: "Alice", age: 30 };
	const bob: Person = { name: "Bob", age: 25 };

	// When: comparing by name
	const result = compareByString(alice, bob, (p) => p.name);

	// Then: result is Less ("Alice" < "Bob")
	assertEquals(unionKinds(result), "Less");
});
