import { assertEquals } from "@std/assert";
import { type LeafDetails, nodeOf, SchemaNode } from "@/src/core/mini/node.ts";
import type { AnySchema } from "@/src/core/mini/schema.ts";
import {
	bigint,
	boolean,
	date,
	literal,
	never,
	null_,
	number,
	string,
	stringbool,
	symbol,
	undefined_,
	unknown,
} from "./mod.ts";

/** A Leaf node of `details`. */
function leafOf(details: LeafDetails): SchemaNode {
	return new SchemaNode("Leaf", details);
}

Deno.test("each primitive records a Leaf node with its options as passed", () => {
	// Given: every primitive, built with options where it takes them
	const minLength = { minLength: 1, trim: true };
	const integer = { int: true, min: 0 };
	const coerced = { coerce: true };
	const positive = { min: 1n };
	const modern = { min: new Date(0) };
	const french = { truthy: ["oui"], falsy: ["non"] };
	const cases: readonly (readonly [AnySchema, LeafDetails])[] = [
		[string(minLength), { type: "string", options: minLength }],
		[number(integer), { type: "number", options: integer }],
		[boolean(coerced), { type: "boolean", options: coerced }],
		[bigint(positive), { type: "bigint", options: positive }],
		[date(modern), { type: "date", options: modern }],
		[stringbool(french), { type: "stringbool", options: french }],
		[literal("admin"), { type: "literal", value: "admin" }],
		[null_(), { type: "null" }],
		[undefined_(), { type: "undefined" }],
		[symbol(), { type: "symbol" }],
		[unknown(), { type: "unknown" }],
		[never(), { type: "never" }],
	];

	for (const [schema, details] of cases) {
		// When: reading the schema's node
		// Then: it is a Leaf of its type, holding the options as passed
		assertEquals(nodeOf(schema), leafOf(details));
	}
});

Deno.test("a primitive built without options records {} as its options", () => {
	// Given: the primitives that take options, built without them
	const cases: readonly (readonly [AnySchema, LeafDetails])[] = [
		[string(), { type: "string", options: {} }],
		[number(), { type: "number", options: {} }],
		[boolean(), { type: "boolean", options: {} }],
		[bigint(), { type: "bigint", options: {} }],
		[date(), { type: "date", options: {} }],
		[stringbool(), { type: "stringbool", options: {} }],
	];

	for (const [schema, details] of cases) {
		// When: reading the schema's node
		// Then: its options are {}
		assertEquals(nodeOf(schema), leafOf(details));
	}
});

Deno.test("string keeps its affix options in its Leaf as passed", () => {
	// Given: a string with a prefix and a suffix
	const options = { startsWith: "v", endsWith: ".json" };

	// When: reading its node
	const node = nodeOf(string(options));

	// Then: the Leaf holds the options as passed
	assertEquals(node, leafOf({ type: "string", options }));
});

Deno.test("string keeps its case option in its Leaf as passed", () => {
	// Given: a string converted to upper case
	const options = { case: "upper" } as const;

	// When: reading its node
	const node = nodeOf(string(options));

	// Then: the Leaf holds the options as passed
	assertEquals(node, leafOf({ type: "string", options }));
});
