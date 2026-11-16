import { assertEquals } from "@std/assert";
import { matrix } from "@/src/mini/core.ts";

Deno.test("matrix() of a single key yields one case per value", () => {
	// Given: a matrix with one dimension
	const definition = { browser: ["chrome", "firefox"] };

	// When: expanding it
	const cases = matrix(definition);

	// Then: each value becomes its own case
	assertEquals(cases, [{ browser: "chrome" }, { browser: "firefox" }]);
});

Deno.test("matrix() yields the Cartesian product in key-major order", () => {
	// Given: two dimensions
	const definition = { a: [1, 2], b: ["x", "y"] };

	// When: expanding it
	const cases = matrix(definition);

	// Then: earlier keys vary slowest
	assertEquals(cases, [
		{ a: 1, b: "x" },
		{ a: 1, b: "y" },
		{ a: 2, b: "x" },
		{ a: 2, b: "y" },
	]);
});

Deno.test("matrix() of no keys yields the single empty case", () => {
	// Given: an empty definition (the identity of the product)
	const definition = {};

	// When: expanding it
	const cases = matrix(definition);

	// Then: exactly one case with no keys
	assertEquals(cases.length, 1);
	assertEquals(Object.keys(cases[0] ?? { missing: true }), []);
});

Deno.test("matrix() with an empty dimension yields no cases", () => {
	// Given: a definition where one dimension has no values
	const definition: { a: number[]; b: string[] } = { a: [1, 2], b: [] };

	// When: expanding it
	const cases = matrix(definition);

	// Then: the product is empty
	assertEquals(cases, []);
});

Deno.test("matrix() case count is the product of dimension sizes", async (t) => {
	// A small generated table of dimension sizes stands in for a property test.
	const sizeTable: number[][] = [
		[1],
		[3],
		[2, 3],
		[3, 2],
		[1, 1, 1],
		[2, 2, 2],
		[4, 1, 3],
		[0, 5],
	];

	for (const sizes of sizeTable) {
		await t.step(`sizes ${JSON.stringify(sizes)}`, () => {
			// Given: a definition with dimensions of the listed sizes
			const definition: Record<string, number[]> = Object.fromEntries(
				sizes.map((n, i) => [`k${i}`, Array.from({ length: n }, (_, j) => j)]),
			);

			// When: expanding it
			const cases = matrix(definition);

			// Then: the count is the product, and every case is distinct
			const product = sizes.reduce((acc, n) => acc * n, 1);
			assertEquals(cases.length, product);
			assertEquals(new Set(cases.map((c) => JSON.stringify(c))).size, product);
		});
	}
});

Deno.test("matrix() covers every value of every dimension", () => {
	// Given: a three-dimensional definition
	const definition = {
		browser: ["chrome", "firefox", "safari"],
		viewport: ["mobile", "desktop"],
		theme: ["light", "dark"],
	};

	// When: expanding it
	const cases = matrix(definition);

	// Then: projecting any key recovers exactly its values
	assertEquals([...new Set(cases.map((c) => c.browser))], definition.browser);
	assertEquals([...new Set(cases.map((c) => c.viewport))], definition.viewport);
	assertEquals([...new Set(cases.map((c) => c.theme))], definition.theme);
});

Deno.test("matrix() cases are independent objects", () => {
	// Given: an expanded matrix
	const cases = matrix({ a: [1, 2] });

	// When: mutating one case
	const [first, second] = cases;
	if (first) first.a = 99;

	// Then: the other case is unaffected
	assertEquals(second, { a: 2 });
});
