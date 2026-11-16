import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { object as mainObject } from "@/src/composites/main/mod.ts";
import { Schema as MainSchema } from "@/src/core/main/mod.ts";
import { children, nodeOf, SchemaNode } from "@/src/core/mini/node.ts";
import { map, Schema } from "@/src/core/mini/schema.ts";
import { number, string } from "@/src/primitives/mini/mod.ts";
import {
	array,
	discriminatedUnion,
	enumOf,
	lazy,
	nullable,
	object,
	optional,
	record,
	tuple,
	union,
} from "./mod.ts";

const text = string();
const count = number();

Deno.test("object records its shape and unknownKeys as passed", () => {
	// Given: a shape with a bare schema and a field entry
	const shape = {
		name: text,
		age: { schema: count, key: "optional" },
	} as const;

	// When: building objects with and without unknownKeys
	const loose = nodeOf(object({ shape }));
	const strict = nodeOf(object({ shape, unknownKeys: "strict" }));

	// Then: each records the shape, and unknownKeys as passed (undefined when
	// absent); its children are the fields' schemas in key order
	assertEquals(
		loose,
		new SchemaNode("Object", { shape, unknownKeys: undefined }),
	);
	assertEquals(
		strict,
		new SchemaNode("Object", { shape, unknownKeys: "strict" }),
	);
	assertEquals(children(loose), [text, count]);
});

Deno.test("array records its item and bounds, absent bounds undefined", () => {
	// Given: arrays with and without bounds
	// When: reading their nodes
	const bounded = nodeOf(array({ item: text, minItems: 1, maxItems: 3 }));
	const plain = nodeOf(array({ item: text }));

	// Then: the bounds are as passed, and always present
	assertEquals(
		bounded,
		new SchemaNode("Array", { item: text, minItems: 1, maxItems: 3 }),
	);
	assertEquals(
		plain,
		new SchemaNode("Array", {
			item: text,
			minItems: undefined,
			maxItems: undefined,
		}),
	);
	assertEquals(children(plain), [text]);
});

Deno.test("tuple, record and union record their children in order", () => {
	// Given: a tuple, a record and a union of the same schemas
	// When: reading their nodes
	const pair = nodeOf(tuple([text, count]));
	const scores = nodeOf(record({ key: text, value: count }));
	const either = nodeOf(union([text, count]));

	// Then: each holds its children as passed
	assertEquals(pair, new SchemaNode("Tuple", { items: [text, count] }));
	assertEquals(scores, new SchemaNode("Record", { key: text, value: count }));
	assertEquals(either, new SchemaNode("Union", { options: [text, count] }));
	assertEquals(children(pair), [text, count]);
	assertEquals(children(scores), [text, count]);
	assertEquals(children(either), [text, count]);
});

Deno.test("discriminatedUnion records its key and options", () => {
	// Given: a discriminated union of two objects
	const circle = object({ shape: { radius: count } });
	const square = object({ shape: { side: count } });

	// When: reading its node
	const node = nodeOf(
		discriminatedUnion({ key: "kind", options: { circle, square } }),
	);

	// Then: it holds the key and options, and its children are the options
	assertEquals(
		node,
		new SchemaNode("DiscriminatedUnion", {
			key: "kind",
			options: { circle, square },
		}),
	);
	assertEquals(children(node), [circle, square]);
});

Deno.test("enumOf records a Leaf of its values", () => {
	// Given: an enum of literals
	// When: reading its node
	// Then: it is an enum Leaf of the values as passed
	assertEquals(
		nodeOf(enumOf(["red", 1])),
		new SchemaNode("Leaf", { type: "enum", values: ["red", 1] }),
	);
});

Deno.test("optional and nullable record the schema they wrap", () => {
	// Given: a schema
	// When: making it optional, and nullable
	const maybe = nodeOf(optional(text));
	const orNull = nodeOf(nullable(text));

	// Then: each records a wrapper over the schema itself
	assertEquals(maybe, new SchemaNode("Optional", { inner: text }));
	assertEquals(orNull, new SchemaNode("Nullable", { inner: text }));
	assertStrictEquals(children(maybe)[0], text);
});

Deno.test("lazy records its getter, and has no children to walk", () => {
	// Given: a lazy schema
	const getter = () => text;

	// When: reading its node
	const node = nodeOf(lazy(getter));

	// Then: it holds the getter, which children doesn't call
	assertEquals(unionKinds(node), "Lazy");
	assertEquals(node, new SchemaNode("Lazy", { getter }));
	assertEquals(children(node), []);
});

Deno.test("a main view of a built-in keeps its node", () => {
	// Given: a mini object schema
	const mini = object({ shape: { name: optional(text) } });

	// When: viewing it as a main schema
	// Then: the node is the mini schema's
	assertStrictEquals(nodeOf(MainSchema.fromMini(mini)), nodeOf(mini));
});

Deno.test("a missing key reports the inner issue through main optional().nullable()", () => {
	// Given: a main field that is optional, then nullable
	const middle = MainSchema.fromMini(text).optional().nullable();
	const person = mainObject({ shape: { middle } });

	// When: the key is missing, null, or undefined
	const missing = person.parseSync({});

	// Then: missing fails as text does for undefined; null and undefined pass
	assertEquals(missing.isErr(), true);
	assertEquals(person.parseSync({ middle: null }).unwrap(), { middle: null });
	assertEquals(person.parseSync({ middle: undefined }).unwrap(), {
		middle: undefined,
	});
});

Deno.test("withoutOptional sees through neither a transform nor a hand-written wrapper", () => {
	// Given: an optional schema hidden behind a map, and an opaque schema
	// that accepts undefined
	const hidden = map(optional(text), (value) => value);
	const accepting = new Schema({ parse: (input: unknown) => Ok(input) });
	const person = mainObject({ shape: { hidden, accepting } });

	// When: both keys are missing
	const parsed = person.parseSync({});

	// Then: each parses undefined as itself, so both pass
	assertEquals(parsed.unwrap(), { hidden: undefined, accepting: undefined });
});
