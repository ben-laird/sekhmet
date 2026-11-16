import { add } from "@sekhmet/new-lib";
import { assertEquals } from "@std/assert";

Deno.test("add() adds two numbers", () => {
	// Given: two numbers
	const [a, b] = [1, 1];

	// When: adding them
	const sum = add(a, b);

	// Then: the sum is their total
	assertEquals(sum, 2);
});
