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

Deno.test("checkModuleState reports top-level let and var, destructured too", () => {
	// Given: a top-level let, an exported var, destructuring lets, and a
	// nested let
	const text = [
		"let count = 0;",
		"export var cache = {};",
		"let { a, b } = pair;",
		"let [first] = list;",
		"function f(): void {",
		"\tlet local = 1;",
		"}",
	].join("\n");

	// When: checking it
	// Then: only the top-level declarations are reported, on their lines
	assertEquals(found(text), [
		"1 a top-level let/var (count)",
		"2 a top-level let/var (cache)",
		"3 a top-level let/var ({ a, b })",
		"4 a top-level let/var ([first])",
	]);
});

Deno.test("checkModuleState reports a top-level registry, typed or not", () => {
	// Given: registries of each mutable constructor, typed in the ways a
	// type annotation can hide its `=`
	const text = [
		"const a = new Map();",
		"export const b: WeakMap<object, number> =",
		"\tnew WeakMap();",
		"const c = new Set<string>();",
		"const d = new WeakSet();",
		"const e: Map<string, () => Schema> = new Map();",
		"const f: Registry<K = string> = new Map();",
		"const g = new Array<number>();",
		"const h = new globalThis.Map();",
		"const i = new WeakRef(target);",
		"const j = new FinalizationRegistry(cleanup);",
	].join("\n");

	// When: checking it
	// Then: each is reported on the line of its name
	assertEquals(found(text), [
		"1 a top-level mutable registry (a)",
		"2 a top-level mutable registry (b)",
		"4 a top-level mutable registry (c)",
		"5 a top-level mutable registry (d)",
		"6 a top-level mutable registry (e)",
		"7 a top-level mutable registry (f)",
		"8 a top-level mutable registry (g)",
		"9 a top-level mutable registry (h)",
		"10 a top-level mutable registry (i)",
		"11 a top-level mutable registry (j)",
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
	assertEquals(found(text), ["1 a top-level mutable registry (WRAPPED)"]);
});

Deno.test("checkModuleState reports a class's static fields that aren't readonly", () => {
	// Given: a class with static fields, a readonly one, and static methods
	const text = [
		"export class Registry {",
		"\tstatic entries: Map<string, number> = new Map();",
		"\tstatic #count = 0;",
		"\tstatic readonly NAME = 'registry';",
		"\tstatic of(name: string): Registry {",
		"\t\treturn new Registry();",
		"\t}",
		"\tstatic get size(): number {",
		"\t\treturn 0;",
		"\t}",
		"\tstatic find<T>(key: T): T {",
		"\t\treturn key;",
		"\t}",
		"}",
	].join("\n");

	// When: checking it
	// Then: only the two mutable static fields are reported
	assertEquals(found(text), [
		"2 a static field (entries)",
		"3 a static field (#count)",
	]);
});

Deno.test("checkModuleState allows immutable constants, factories, local state and comments", () => {
	// Given: constants, a factory of state, a function-local Map, an arrow
	// returning a Map, and state that appears only in a comment and a string
	const text = [
		'export const BRAND: unique symbol = Symbol("brand");',
		'const NAMES: readonly string[] = Object.freeze(["a"]);',
		"const makeCache = (): Map<string, number> => new Map();",
		"export function f(): number {",
		"\tconst seen = new Map();",
		"\treturn seen.size;",
		"}",
		"// let old = new Map();",
		'const doc = "let x = new Map()";',
		"const next = 1;",
	].join("\n");

	// When: checking it
	// Then: nothing is reported
	assertEquals(found(text), []);
});
