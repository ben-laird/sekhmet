import { assertEquals } from "@std/assert";
import { checkModuleState, isStatelessSource } from "./module-state.ts";
import { sourceViews } from "./source.ts";

/** The `line message-subject` of each finding in `text`. */
function found(text: string): string[] {
	return checkModuleState({
		path: "packages/schema/src/a.ts",
		text,
		views: sourceViews(text),
	}).map(({ line, message }) => `${line} ${message.split(" is ")[0]}`);
}

Deno.test("isStatelessSource covers non-test schema source only", () => {
	// Given: paths in and out of the stateless roots
	const paths = [
		"packages/schema/src/core/mini/node.ts",
		"packages/schema/src/core/mini/node.test.ts",
		"packages/schema/mod.ts",
		"packages/enum/src/core/mini/core.ts",
		"packages/schema/src/README.md",
	];

	// When: classifying each
	const results = paths.map(isStatelessSource);

	// Then: only the schema source module is covered
	assertEquals(results, [true, false, false, false, false]);
});

Deno.test("checkModuleState reports top-level let and var", () => {
	// Given: a module with a top-level let, an exported var, and a nested let
	const text = [
		"let count = 0;",
		"export var cache = {};",
		"function f(): void {",
		"\tlet local = 1;",
		"}",
	].join("\n");

	// When: checking it
	// Then: only the two top-level declarations are reported, on their lines
	assertEquals(found(text), [
		"1 a top-level let/var (count)",
		"2 a top-level let/var (cache)",
	]);
});

Deno.test("checkModuleState reports a top-level Map/Set registry, typed or not", () => {
	// Given: registries of each kind, one with a type annotation over two lines
	const text = [
		"const a = new Map();",
		"export const b: WeakMap<object, number> =",
		"\tnew WeakMap();",
		"const c = new Set<string>();",
		"const d = new WeakSet();",
	].join("\n");

	// When: checking it
	// Then: each is reported on the line of its name
	assertEquals(found(text), [
		"1 a top-level Map/Set registry (a)",
		"2 a top-level Map/Set registry (b)",
		"4 a top-level Map/Set registry (c)",
		"5 a top-level Map/Set registry (d)",
	]);
});

Deno.test("checkModuleState reports the WeakMap registry #32 removed", () => {
	// Given: the module-level registry composites/mini/collect.ts once held
	const text = [
		"const WRAPPED: WeakMap<object, { modifier: Modifier; inner: Child }> =",
		"\tnew WeakMap();",
	].join("\n");

	// When: checking it
	// Then: it is reported
	assertEquals(found(text), ["1 a top-level Map/Set registry (WRAPPED)"]);
});

Deno.test("checkModuleState allows immutable constants, local state and comments", () => {
	// Given: a frozen constant, a symbol, a function-local Map, and state
	// that appears only in a comment and a string
	const text = [
		'export const BRAND: unique symbol = Symbol("brand");',
		'const NAMES: readonly string[] = ["a"];',
		"export function f(): number {",
		"\tconst seen = new Map();",
		"\treturn seen.size;",
		"}",
		"// let old = new Map();",
		'const doc = "let x = 1";',
	].join("\n");

	// When: checking it
	// Then: nothing is reported
	assertEquals(found(text), []);
});
