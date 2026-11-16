import { assertEquals } from "@std/assert";

Deno.test("Lab test", () => {
	// Given: two numbers
	const [a, b] = [1, 1];

	// When: adding them
	const sum = a + b;

	// Then: the sum is their total
	assertEquals(sum, 2);
});
