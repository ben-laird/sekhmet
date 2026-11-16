import { assertEquals } from "@std/assert";
import { all, err, ok } from "./result.ts";

Deno.test("all collects every success in order", () => {
	// Given: only successes
	const results = [ok(1), ok(2), ok(3)];

	// When: collecting them
	const collected = all(results);

	// Then: the values come back in order
	assertEquals(collected, ok([1, 2, 3]));
});

Deno.test("all stops at the first failure", () => {
	// Given: a failure between successes
	const results = [ok(1), err("first"), err("second")];

	// When: collecting them
	const collected = all(results);

	// Then: the first error is returned
	assertEquals(collected, err("first"));
});
