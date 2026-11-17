import { union, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { isNone, unwrap } from "@sekhmet/enum/option/mini";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Schema as MainSchema } from "@/src/core/main/mod.ts";
import {
	children,
	custom,
	customData,
	type NodeKind,
	nodeKind,
	nodeOf,
	Opaque,
	SchemaNode,
	type TransformStep,
} from "./node.ts";
import {
	type AnySchema,
	andThen,
	type ErrorOf,
	filter,
	type Input,
	inspect,
	inspectErr,
	map,
	mapErr,
	type Output,
	orElse,
	pipe,
	preprocess,
	Schema,
} from "./schema.ts";

const text: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
const length = new Schema({ parse: (input: string) => Ok(input.length) });

Deno.test("a schema built from a parser alone is Opaque, with no annotations", () => {
	// Given: a hand-written schema
	// When: reading its params
	const { node, annotations } = getStructParams(text);

	// Then: its node is Opaque and it has no annotations
	assertEquals(node, Opaque());
	assertEquals(unionKinds(node), "Opaque");
	assertEquals(annotations, []);
});

Deno.test("a schema keeps the node it was built with", () => {
	// Given: a node
	const node = new SchemaNode("Leaf", { type: "unknown" });

	// When: building a schema with it
	const schema = new Schema({ parse: (input: unknown) => Ok(input), node });

	// Then: nodeOf returns that node
	assertStrictEquals(nodeOf(schema), node);
});

Deno.test("each transform records a Transform node of its step over self", () => {
	// Given: a schema, and every transform of it
	const transforms: readonly (readonly [TransformStep, AnySchema])[] = [
		["map", map(text, (value) => value.length)],
		["mapErr", mapErr(text, (error) => error.length)],
		["andThen", andThen(text, (value) => Ok(value))],
		["orElse", orElse(text, () => Ok("fallback"))],
		[
			"filter",
			filter(text, {
				error: "not text",
				predicate: (value): value is string => value !== "",
			}),
		],
		["inspect", inspect(text, () => {})],
		["inspectErr", inspectErr(text, () => {})],
		["preprocess", preprocess(text, (input: unknown) => input)],
	];

	for (const [step, schema] of transforms) {
		// When: reading the transform's node
		const node = nodeOf(schema);

		// Then: it is a Transform of that step, wrapping the schema itself
		assertEquals(unionKinds(node), "Transform");
		assertEquals(union(node), { step, inner: text });
		assertStrictEquals(children(node)[0], text);
	}
});

Deno.test("pipe records a Pipe node of both schemas", () => {
	// Given: two schemas
	// When: piping them
	const node = nodeOf(pipe(text, length));

	// Then: the node holds both, in order
	assertEquals(unionKinds(node), "Pipe");
	assertEquals(union(node), { inner: text, next: length });
	assertEquals(children(node), [text, length]);
});

Deno.test("a main view of a mini schema keeps its node and annotations", () => {
	// Given: a mini schema with a node
	const mini = map(text, (value) => value.length);

	// When: viewing it as a main schema
	const main = MainSchema.fromMini(mini);

	// Then: the node and annotations are the mini schema's
	assertStrictEquals(nodeOf(main), nodeOf(mini));
	assertStrictEquals(
		getStructParams(main).annotations,
		getStructParams(mini).annotations,
	);
});

Deno.test("main methods record nodes over the main receiver", () => {
	// Given: a main schema
	const main = MainSchema.fromMini(text);

	// When: mapping it with a method
	const node = nodeOf(main.map((value) => value.length));

	// Then: the node is a map Transform over the receiver
	assertEquals(union(node), { step: "map", inner: main });
});

Deno.test("a custom node round-trips its data through its own kind only", () => {
	// Given: two kinds, and a schema with a custom node of one
	const money = nodeKind<{ currency: string }>({ name: "money" });
	const other = nodeKind<{ currency: string }>({ name: "money" });
	const euros = new Schema({
		parse: (input: unknown) => {
			return typeof input === "number" ? Ok(input) : Err("not an amount");
		},
		node: custom({ kind: money, data: { currency: "EUR" }, children: [text] }),
	});

	// When: reading its data as each kind
	const own = customData({ node: nodeOf(euros), kind: money });
	const foreign = customData({ node: nodeOf(euros), kind: other });

	// Then: its own kind reads the data, another kind (even of the same name)
	// reads None, and its children are as given
	assertEquals(unwrap(own), { currency: "EUR" });
	assertEquals(isNone(foreign), true);
	assertEquals(children(nodeOf(euros)), [text]);
	assertType<IsExact<typeof own, typeof foreign>>(true);
});

Deno.test("a custom node can't be forged, nor its kind widened", () => {
	// Given: a kind
	const money = nodeKind<{ currency: string }>({ name: "money" });

	// When: widening the kind, and building Custom details by hand
	// Then: each is a type error, and custom() still reads back as built
	// @ts-expect-error kinds are invariant in their data type
	const loose: NodeKind<unknown> = money;
	new SchemaNode("Custom", {
		// @ts-expect-error only custom() builds a Custom node's details
		kind: money,
		data: 42,
		children: [],
	});
	assertStrictEquals(loose, money);
	assertEquals(
		unwrap(
			customData({
				node: custom({ kind: money, data: { currency: "EUR" } }),
				kind: money,
			}),
		),
		{ currency: "EUR" },
	);
});

Deno.test("customData of a node of another variant is None", () => {
	// Given: a kind, and nodes of other variants
	const money = nodeKind<string>({ name: "money" });

	// When: reading them as the kind
	// Then: each is None
	assertEquals(isNone(customData({ node: Opaque(), kind: money })), true);
	assertEquals(
		isNone(customData({ node: nodeOf(map(text, String)), kind: money })),
		true,
	);
});

Deno.test("a custom node without children has none", () => {
	// Given: a custom node built without children
	const tag = nodeKind<number>({ name: "tag" });

	// When: listing its children
	// Then: there are none
	assertEquals(children(custom({ kind: tag, data: 1 })), []);
});

Deno.test("new Schema takes no explicit undefined node or annotations", () => {
	// Given: a parser
	const parse = (input: unknown) => Ok(input);

	// When: passing undefined for the optional fields
	// Then: each is a type error (exactOptionalPropertyTypes)
	// @ts-expect-error node may be omitted, not undefined
	new Schema({ parse, node: undefined });
	// @ts-expect-error annotations may be omitted, not undefined
	new Schema({ parse, annotations: undefined });
});

Deno.test("Input, Output and ErrorOf read the three type parameters", () => {
	// Given: a schema type
	type Length = Schema<string, number, "too long">;

	// When: reading its parameters
	// Then: each is the one it was declared with
	assertType<IsExact<Input<Length>, string>>(true);
	assertType<IsExact<Output<Length>, number>>(true);
	assertType<IsExact<ErrorOf<Length>, "too long">>(true);
	assertType<IsExact<Input<typeof length>, string>>(true);
	assertType<IsExact<Output<typeof length>, number>>(true);
	assertType<IsExact<ErrorOf<typeof length>, never>>(true);
});
