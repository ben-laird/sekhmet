import { assertEquals } from "@std/assert";
import { functionBindings } from "./bindings.ts";
import { sourceViews } from "./source.ts";

/** Each function's parameters and body text, in source order. */
function describe(text: string): [readonly (string | undefined)[], string][] {
	const { structure } = sourceViews(text);
	return functionBindings(structure).map(({ params, bodyStart, bodyEnd }) => {
		return [params, structure.slice(bodyStart, bodyEnd)];
	});
}

Deno.test("functionBindings reads each function form's parameters and body", () => {
	// Given: an arrow with a block, a typed arrow, a bare arrow, a function
	// and an fn method
	const text = `f((a, b) => { a; });
g((t: Ctx): void => t.x, 1);
h(c => c);
function named(d) { d; }
({ fn(e) { e; } });`;

	// When: the functions are read
	const found = describe(text);

	// Then: each has its plain parameters and its body, in source order
	assertEquals(found, [
		[["a", "b"], "{ a; }"],
		[["t"], "t.x"],
		[["c"], "c"],
		[["d"], "{ d; }"],
		[["e"], "{ e; }"],
	]);
});

Deno.test("functionBindings marks a destructured parameter as unnamed", () => {
	// Given: an arrow destructuring its first parameter
	const text = `f(({ context, step }, n) => { step; });`;

	// When: the functions are read
	const found = describe(text);

	// Then: the destructured parameter has no name; the plain one does
	assertEquals(found, [[[undefined, "n"], "{ step; }"]]);
});
