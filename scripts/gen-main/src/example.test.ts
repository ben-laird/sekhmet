import { assertEquals } from "@std/assert";
import { toFieldMethodForm, toMainImports, toMethodForm } from "./example.ts";

const NONE: ReadonlySet<string> = new Set();

Deno.test("toMainImports moves mini imports to main and drops methods", () => {
	// Given: an example importing a constructor and a method from mini
	const code =
		'```ts\nimport { Some, map } from "@sekhmet/enum/option/mini";\n\nSome(1).map((x) => x);\n```';

	// When: rewriting it for main, where map is a method
	const rewritten = toMainImports({
		code,
		entrypoint: "@sekhmet/enum/option",
		methods: new Set(["map"]),
		omitted: NONE,
	});

	// Then: the constructor comes from main and map is no longer imported
	assertEquals(
		rewritten,
		'```ts\nimport { Some } from "@sekhmet/enum/option";\n\nSome(1).map((x) => x);\n```',
	);
});

Deno.test("toMainImports removes an import left empty", () => {
	// Given: an example whose only import is the method itself, from a mini subpath
	const code =
		'```ts\nimport { unwrap } from "@sekhmet/enum/option/mini/unwrap";\n\nopt.unwrap();\n```';

	// When: rewriting it for main
	const rewritten = toMainImports({
		code,
		entrypoint: "@sekhmet/enum/option",
		methods: new Set(["unwrap"]),
		omitted: NONE,
	});

	// Then: the import and the blank line after the fence are gone
	assertEquals(rewritten, "```ts\nopt.unwrap();\n```");
});

Deno.test("toMainImports keeps omitted names, other packages and type imports", () => {
	// Given: an omitted name, an aliased name, a type import and another package's import
	const code = [
		'import { Failed, spawn as go } from "@sekhmet/effect/fiber/mini";',
		'import type { Fiber } from "@sekhmet/effect/fiber/mini/fiber";',
		'import { Ok } from "@sekhmet/enum/result/mini";',
	].join("\n");

	// When: rewriting it for the fiber main entrypoint
	const rewritten = toMainImports({
		code,
		entrypoint: "@sekhmet/effect/fiber",
		methods: NONE,
		omitted: new Set(["Failed"]),
	});

	// Then: omitted names stay on mini, the rest move to main, other packages are untouched
	assertEquals(
		rewritten,
		[
			'import { spawn as go } from "@sekhmet/effect/fiber";',
			'import { Failed } from "@sekhmet/effect/fiber/mini";',
			'import type { Fiber } from "@sekhmet/effect/fiber";',
			'import { Ok } from "@sekhmet/enum/result/mini";',
		].join("\n"),
	);
});

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

Deno.test("toMethodForm rewrites a spread call", () => {
	// Given: a call spread into an array
	const code = "[...iter(Some(42))]";

	// When: rewriting calls of iter
	const rewritten = toMethodForm({ code, name: "iter" });

	// Then: the spread operand becomes a method call
	assertEquals(rewritten, "[...Some(42).iter()]");
});

Deno.test("toMethodForm gives up on unbalanced calls", () => {
	// Given: a call missing its closing parenthesis
	const code = "map(Some(1), f";

	// When: rewriting it
	const rewritten = toMethodForm({ code, name: "map" });

	// Then: there is no rewrite
	assertEquals(rewritten, undefined);
});

Deno.test("toFieldMethodForm moves an options field's value to the receiver", () => {
	// Given: calls passing the receiver in an options field, by name and shorthand
	const code =
		"const tags = array({ item: text });\nconst all = array({ item });";

	// When: rewriting calls of array whose receiver is the item field
	const rewritten = toFieldMethodForm({ code, name: "array", field: "item" });

	// Then: each call becomes a method call on the field's value
	assertEquals(
		rewritten,
		"const tags = text.array();\nconst all = item.array();",
	);
});

Deno.test("toFieldMethodForm nests and parenthesizes complex receivers", () => {
	// Given: a nested call, and a receiver that isn't a plain identifier or call
	const code =
		"array({ item: array({ item: text }) }); array({ item: a ?? b, })";

	// When: rewriting calls of array
	const rewritten = toFieldMethodForm({ code, name: "array", field: "item" });

	// Then: the inner call is rewritten too, and the complex receiver is wrapped
	assertEquals(rewritten, "text.array().array(); (a ?? b).array()");
});

Deno.test("toFieldMethodForm leaves calls with other options or arguments alone", () => {
	// Given: a call with another option, a positional call and a method call
	const code =
		"array({ item: text, minItems: 1 }); array(text); xs.array({ item: text })";

	// When: rewriting calls of array
	const rewritten = toFieldMethodForm({ code, name: "array", field: "item" });

	// Then: none passes the receiver alone in the field, so none changes
	assertEquals(rewritten, code);
});

Deno.test("toFieldMethodForm gives up on unbalanced calls", () => {
	// Given: a call missing its closing parenthesis
	const code = "array({ item: text }";

	// When: rewriting it
	const rewritten = toFieldMethodForm({ code, name: "array", field: "item" });

	// Then: there is no rewrite
	assertEquals(rewritten, undefined);
});
