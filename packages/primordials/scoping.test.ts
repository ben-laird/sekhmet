import { assertEquals } from "@std/assert";
import { block, define } from "@/scoping.ts";

Deno.test("block executes function and returns result", () => {
	// Given: a function that computes a value
	const compute = (): number => {
		const a = 1;
		const b = 2;
		return a + b;
	};

	// When: we call block with the function
	const result = block(compute);

	// Then: we get the computed result
	assertEquals(result, 3);
});

Deno.test("block allows complex expressions as statements", () => {
	// Given: a need to compute an intermediate value inline
	const items = [1, 2, 3];

	// When: we use block to create an expression
	const doubled = block(() => {
		const multiplier = 2;
		return items.map((x) => x * multiplier);
	});

	// Then: we get the expected result
	assertEquals(doubled, [2, 4, 6]);
});

Deno.test("define returns the same value unchanged", () => {
	// Given: a value
	const value = { name: "test", count: 42 };

	// When: we pass it through define
	const result = define(value);

	// Then: we get the exact same reference back
	assertEquals(result, value);
	assertEquals(result === value, true);
});

Deno.test("define preserves type inference", () => {
	// Given: an object literal
	// When: we use define to create it
	const config = define({
		port: 3000,
		host: "localhost",
	});

	// Then: the type is preserved and accessible
	assertEquals(config.port, 3000);
	assertEquals(config.host, "localhost");
});
