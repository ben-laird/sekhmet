import { assertEquals } from "@std/assert";
import { toMethodForm } from "./example.ts";

Deno.test("toMethodForm moves the first argument to the receiver", () => {
	// Given: a call with a receiver and more arguments
	const code = "map(Some(10), (x) => x * 2); // Some(20)";

	// When: rewriting it
	const rewritten = toMethodForm({ code, name: "map" });

	// Then: the first argument becomes the receiver
	assertEquals(rewritten, "Some(10).map((x) => x * 2); // Some(20)");
});

Deno.test("toMethodForm handles single-argument calls and every occurrence", () => {
	// Given: two calls with only a receiver
	const code = "unwrap(Some(42));\nunwrap(None());";

	// When: rewriting them
	const rewritten = toMethodForm({ code, name: "unwrap" });

	// Then: both become empty method calls
	assertEquals(rewritten, "Some(42).unwrap();\nNone().unwrap();");
});

Deno.test("toMethodForm rewrites nested calls of the same function", () => {
	// Given: a call whose receiver is itself a call to the function
	const code = "flatten(flatten(x))";

	// When: rewriting it
	const rewritten = toMethodForm({ code, name: "flatten" });

	// Then: the calls chain
	assertEquals(rewritten, "x.flatten().flatten()");
});

Deno.test("toMethodForm parenthesizes complex receivers", () => {
	// Given: a receiver that is a binary expression
	const code = "abs(a - b)";

	// When: rewriting it
	const rewritten = toMethodForm({ code, name: "abs" });

	// Then: the receiver is wrapped in parentheses
	assertEquals(rewritten, "(a - b).abs()");
});

Deno.test("toMethodForm leaves other identifiers and methods alone", () => {
	// Given: a method call and a longer identifier ending in the name
	const code = "opt.map(f); flatMap(opt, g);";

	// When: rewriting calls of map
	const rewritten = toMethodForm({ code, name: "map" });

	// Then: nothing changes
	assertEquals(rewritten, code);
});

Deno.test("toMethodForm gives up on unbalanced calls", () => {
	// Given: a call missing its closing parenthesis
	const code = "map(Some(1), f";

	// When: rewriting it
	const rewritten = toMethodForm({ code, name: "map" });

	// Then: there is no rewrite
	assertEquals(rewritten, undefined);
});
