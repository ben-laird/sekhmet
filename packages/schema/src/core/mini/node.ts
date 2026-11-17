/**
 * What a schema is, as data: every `Schema` carries a {@linkcode SchemaNode}
 * describing how it was built (a leaf and its options, a composite and its
 * children, a transform of another schema), so tools can read a schema's
 * structure without parsing with it. Read it with {@linkcode nodeOf}, walk it
 * with {@linkcode children}, and define kinds of your own with
 * {@linkcode nodeKind}.
 *
 * @module
 */

import { Enum } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { Shape, UnknownKeys } from "@/src/composites/mini/object.ts";
import type { BigintSchemaOptions } from "@/src/primitives/mini/bigint.ts";
import type { BooleanSchemaOptions } from "@/src/primitives/mini/boolean.ts";
import type { DateSchemaOptions } from "@/src/primitives/mini/date.ts";
import type { Literal } from "@/src/primitives/mini/literal.ts";
import type { NumberSchemaOptions } from "@/src/primitives/mini/number.ts";
import type { StringSchemaOptions } from "@/src/primitives/mini/string.ts";
import type { StringboolOptions } from "@/src/primitives/mini/stringbool.ts";
import type { AnySchema } from "./schema.ts";

/**
 * The details of a `Leaf` node: which built-in leaf schema it is, told apart
 * by `type`, with the options it was built with as they were passed (`{}`
 * when none were).
 *
 * @example
 * ```ts
 * import type { LeafDetails } from "@sekhmet/schema/core/mini/node";
 *
 * const details: LeafDetails = { type: "string", options: { minLength: 1 } };
 * ```
 */
export type LeafDetails =
	| {
			/** A `string()` schema. */
			readonly type: "string";
			/** Its options, as passed. */
			readonly options: StringSchemaOptions;
	  }
	| {
			/** A `number()` schema. */
			readonly type: "number";
			/** Its options, as passed. */
			readonly options: NumberSchemaOptions;
	  }
	| {
			/** A `boolean()` schema. */
			readonly type: "boolean";
			/** Its options, as passed. */
			readonly options: BooleanSchemaOptions;
	  }
	| {
			/** A `bigint()` schema. */
			readonly type: "bigint";
			/** Its options, as passed. */
			readonly options: BigintSchemaOptions;
	  }
	| {
			/** A `date()` schema. */
			readonly type: "date";
			/** Its options, as passed. */
			readonly options: DateSchemaOptions;
	  }
	| {
			/** A `stringbool()` schema. */
			readonly type: "stringbool";
			/** Its options, as passed. */
			readonly options: StringboolOptions;
	  }
	| {
			/** A `literal(value)` schema. */
			readonly type: "literal";
			/** The one value it accepts. */
			readonly value: Literal;
	  }
	| {
			/** An `enumOf(values)` schema. */
			readonly type: "enum";
			/** The values it accepts, in order. */
			readonly values: readonly Literal[];
	  }
	| {
			/**
			 * A schema without options: `null_()`, `undefined_()`, `symbol()`,
			 * `unknown()` or `never()`.
			 */
			readonly type: "null" | "undefined" | "symbol" | "unknown" | "never";
	  };

/**
 * The details of a node that wraps one schema: `Optional`, `Nullable` and
 * `Readonly`.
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { Schema } from "@sekhmet/schema/core/mini";
 * import type { WrapperDetails } from "@sekhmet/schema/core/mini/node";
 *
 * const details: WrapperDetails = {
 * 	inner: new Schema({ parse: (input: unknown) => Ok(input) }),
 * };
 * ```
 */
export interface WrapperDetails {
	/** The wrapped schema. */
	readonly inner: AnySchema;
}

/**
 * The details of an `Object` node: `object`'s options, as passed.
 *
 * @example
 * ```ts
 * import type { ObjectDetails } from "@sekhmet/schema/core/mini/node";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: ObjectDetails = { shape: { name: string() }, unknownKeys: undefined };
 * ```
 */
export interface ObjectDetails {
	/** Each field's schema, or its field entry. */
	readonly shape: Shape;
	/** What to do with undeclared keys; `undefined` when not given (`"strip"`). */
	readonly unknownKeys: UnknownKeys | undefined;
}

/**
 * The details of an `Array` node: `array`'s options, as passed.
 *
 * @example
 * ```ts
 * import type { ArrayDetails } from "@sekhmet/schema/core/mini/node";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: ArrayDetails = { item: string(), minItems: 1, maxItems: undefined };
 * ```
 */
export interface ArrayDetails {
	/** The schema for each element. */
	readonly item: AnySchema;
	/** The fewest elements allowed; `undefined` when not given. */
	readonly minItems: number | undefined;
	/** The most elements allowed; `undefined` when not given. */
	readonly maxItems: number | undefined;
}

/**
 * The details of a `Tuple` node: each element's schema, in order.
 *
 * @example
 * ```ts
 * import type { TupleDetails } from "@sekhmet/schema/core/mini/node";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: TupleDetails = { items: [string(), number()] };
 * ```
 */
export interface TupleDetails {
	/** Each element's schema, in order. */
	readonly items: readonly AnySchema[];
}

/**
 * The details of a `Record` node: `record`'s options.
 *
 * @example
 * ```ts
 * import type { RecordDetails } from "@sekhmet/schema/core/mini/node";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: RecordDetails = { key: string(), value: number() };
 * ```
 */
export interface RecordDetails {
	/** The schema each key is parsed by. */
	readonly key: AnySchema;
	/** The schema each key's value is parsed by. */
	readonly value: AnySchema;
}

/**
 * The details of a `Union` node: the schemas tried, in order.
 *
 * @example
 * ```ts
 * import type { UnionDetails } from "@sekhmet/schema/core/mini/node";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: UnionDetails = { options: [string(), number()] };
 * ```
 */
export interface UnionDetails {
	/** The schemas tried, in order (at least one). */
	readonly options: readonly [AnySchema, ...AnySchema[]];
}

/**
 * The details of a `DiscriminatedUnion` node: `discriminatedUnion`'s
 * declaration.
 *
 * @example
 * ```ts
 * import { object } from "@sekhmet/schema/composites/mini";
 * import type { DiscriminatedUnionDetails } from "@sekhmet/schema/core/mini/node";
 *
 * const details: DiscriminatedUnionDetails = {
 * 	key: "kind",
 * 	options: { circle: object({ shape: {} }) },
 * };
 * ```
 */
export interface DiscriminatedUnionDetails {
	/** The key holding the discriminant. */
	readonly key: string;
	/** Each discriminant value's schema. */
	readonly options: { readonly [value: string]: AnySchema };
}

/**
 * The details of a `Lazy` node: the function that returns the schema it
 * parses with, called on every parse.
 *
 * @example
 * ```ts
 * import type { LazyDetails } from "@sekhmet/schema/core/mini/node";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: LazyDetails = { getter: () => string() };
 * ```
 */
export interface LazyDetails {
	/** Returns the schema to parse with. */
	readonly getter: () => AnySchema;
}

/**
 * Which transform built a `Transform` node: the name of the function (or
 * main method) that made it.
 *
 * @example
 * ```ts
 * import type { TransformStep } from "@sekhmet/schema/core/mini/node";
 *
 * const step: TransformStep = "map";
 * ```
 */
export type TransformStep =
	| "map"
	| "mapErr"
	| "andThen"
	| "orElse"
	| "filter"
	| "inspect"
	| "inspectErr"
	| "preprocess";

/**
 * The details of a `Transform` node: which transform, and the schema it
 * transforms. The callback is not recorded: a node describes structure, and
 * a function can't be read.
 *
 * @example
 * ```ts
 * import type { TransformDetails } from "@sekhmet/schema/core/mini/node";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: TransformDetails = { step: "map", inner: string() };
 * ```
 */
export interface TransformDetails {
	/** Which transform built the node. */
	readonly step: TransformStep;
	/** The transformed schema. */
	readonly inner: AnySchema;
}

/**
 * The details of a `Pipe` node: the schema that parses first, and the one
 * its output goes to.
 *
 * @example
 * ```ts
 * import type { PipeDetails } from "@sekhmet/schema/core/mini/node";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const details: PipeDetails = { inner: string(), next: number() };
 * ```
 */
export interface PipeDetails {
	/** The schema that parses first. */
	readonly inner: AnySchema;
	/** The schema `inner`'s output is parsed with. */
	readonly next: AnySchema;
}

/**
 * A kind of `Custom` node, defined with {@linkcode nodeKind}: a value you
 * hold, which tags the nodes you build with {@linkcode custom} and reads
 * their data back with {@linkcode customData}. Kinds are told apart by
 * identity, not by name: two kinds with one name are different kinds. `D`
 * is invariant, so a kind can't be widened (to `NodeKind<unknown>`) to
 * build a node with data of another type.
 *
 * @template D The data each node of this kind carries
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type NodeKind, nodeKind } from "@sekhmet/schema/core/mini/node";
 *
 * const money: NodeKind<{ currency: string }> = nodeKind({ name: "money" });
 *
 * assertEquals(money.name, "money");
 * // @ts-expect-error kinds are invariant in their data type
 * const loose: NodeKind<unknown> = money;
 * ```
 */
export interface NodeKind<in out D> {
	/** The kind's name, for display. */
	readonly name: string;
	/**
	 * Type-only: never set at runtime. It carries `D`, the data type each
	 * node of this kind carries.
	 */
	readonly dataType?: D;
}

/**
 * The details of a `Custom` node: the schemas it is built from (`children`)
 * and its kind's `name`, with its kind and data held privately. Build them
 * with {@linkcode custom} (which is `CustomNodeDetails.of`), typed by the
 * kind, and read the data with {@linkcode customData}. The constructor is
 * private and the fields `#private`, so the `SchemaNode` constructor can't
 * be handed forged details.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import {
 * 	children,
 * 	custom,
 * 	type CustomNodeDetails,
 * 	nodeKind,
 * } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<string>({ name: "money" });
 *
 * assertEquals(children(custom({ kind: money, data: "EUR" })), []);
 * const fields = { kind: money, data: 42, children: [] };
 * // @ts-expect-error only custom() builds a Custom node's details
 * const forged: CustomNodeDetails = fields;
 * ```
 */
export class CustomNodeDetails {
	readonly #kind: object;
	readonly #data: unknown;
	/** The name of the node's kind. */
	readonly name: string;
	/** The schemas the node is built from. */
	readonly children: readonly AnySchema[];

	private constructor(entry: {
		readonly kind: { readonly name: string };
		readonly data: unknown;
		readonly children: readonly AnySchema[];
	}) {
		this.#kind = entry.kind;
		this.#data = entry.data;
		this.name = entry.kind.name;
		this.children = entry.children;
	}

	/**
	 * A `Custom` node's details: its kind, data of the kind's type, and the
	 * schemas it is built from.
	 *
	 * @template D The kind's data type
	 * @param entry The kind, its data, and the node's children
	 * @returns The details
	 */
	static of<D>(entry: {
		readonly kind: NodeKind<D>;
		readonly data: D;
		readonly children: readonly AnySchema[];
	}): CustomNodeDetails {
		return new CustomNodeDetails(entry);
	}

	/**
	 * The data of `details` when its kind is `kind`, typed by the kind;
	 * `None` for another kind.
	 *
	 * @template D The kind's data type
	 * @param options The details, and the kind to read them as
	 * @returns The node's data, when it is of `kind`
	 */
	static dataOf<D>(options: {
		readonly details: CustomNodeDetails;
		readonly kind: NodeKind<D>;
	}): Option<D> {
		const { details, kind } = options;
		if (details.#kind !== kind) return None();

		return Some(dataOfKind<D>(details.#data));
	}
}

/**
 * The data of a `Custom` node whose kind is a `NodeKind<D>`. Only
 * `CustomNodeDetails.of`, typed by the (invariant) kind, builds a node's
 * details, so identity, which `CustomNodeDetails.dataOf` checked, proves
 * the data is a `D`; the type system can't carry that through the erased
 * node, so this one cast restores it.
 */
function dataOfKind<D>(data: unknown): D {
	return data as D;
}

/**
 * The variants of a {@linkcode SchemaNode}, each carrying its details.
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Isolate } from "@sekhmet/enum/core/mini/core";
 * import type { SchemaNodeVariants, WrapperDetails } from "@sekhmet/schema/core/mini/node";
 *
 * type Optional = Isolate<SchemaNodeVariants, "Optional">;
 * assertType<IsExact<Optional, [kind: "Optional", details: WrapperDetails]>>(true);
 * ```
 */
export type SchemaNodeVariants =
	| [kind: "Opaque"]
	| [kind: "Leaf", details: LeafDetails]
	| [kind: "Optional", details: WrapperDetails]
	| [kind: "Nullable", details: WrapperDetails]
	| [kind: "Object", details: ObjectDetails]
	| [kind: "Array", details: ArrayDetails]
	| [kind: "Tuple", details: TupleDetails]
	| [kind: "Record", details: RecordDetails]
	| [kind: "Union", details: UnionDetails]
	| [kind: "DiscriminatedUnion", details: DiscriminatedUnionDetails]
	| [kind: "Lazy", details: LazyDetails]
	| [kind: "Transform", details: TransformDetails]
	| [kind: "Pipe", details: PipeDetails]
	| [kind: "Readonly", details: WrapperDetails]
	| [kind: "Custom", details: CustomNodeDetails];

/**
 * What a schema is, as data: how it was built. Built-in schemas record
 * their own node (a leaf with its options as passed, a composite with its
 * children, a transform with the schema it transforms); a schema built with
 * `new Schema({ parse })` alone is `Opaque`. A node never holds a callback
 * (a transform records its step's name), apart from `Lazy`'s getter, which
 * is how a recursive schema reaches itself.
 *
 * Variants: `Opaque`, `Leaf`, `Optional`, `Nullable`, `Object`, `Array`,
 * `Tuple`, `Record`, `Union`, `DiscriminatedUnion`, `Lazy`, `Transform`,
 * `Pipe`, `Readonly` and `Custom` (see {@linkcode SchemaNodeVariants}).
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { map, Schema } from "@sekhmet/schema/core/mini";
 * import { nodeOf } from "@sekhmet/schema/core/mini/node";
 *
 * const text = new Schema({ parse: (input: unknown) => Ok(String(input)) });
 *
 * assertEquals(unionKinds(nodeOf(text)), "Opaque");
 * assertEquals(unionKinds(nodeOf(map(text, (s) => s.length))), "Transform");
 * ```
 */
export class SchemaNode extends Enum<SchemaNodeVariants> {}

/**
 * The node of a schema that records no structure: what
 * `new Schema({ parse })` gets by default.
 *
 * @returns An `Opaque` node
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Opaque } from "@sekhmet/schema/core/mini/node";
 *
 * assertEquals(unionKinds(Opaque()), "Opaque");
 * ```
 */
export function Opaque(): SchemaNode {
	return new SchemaNode("Opaque");
}

/**
 * A schema's node: what it is, as data.
 *
 * @param schema The schema to read
 * @returns The node it was built with
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { Schema } from "@sekhmet/schema/core/mini";
 * import { nodeOf } from "@sekhmet/schema/core/mini/node";
 *
 * const anything = new Schema({ parse: (input: unknown) => Ok(input) });
 *
 * assertEquals(unionKinds(nodeOf(anything)), "Opaque");
 * ```
 */
export function nodeOf(schema: AnySchema): SchemaNode {
	return getStructParams(schema).node;
}

/** The schema of a shape's value: the schema itself, or a field entry's. */
function fieldSchema(entry: Shape[string]): AnySchema {
	return "schema" in entry ? entry.schema : entry;
}

/**
 * The schemas a node is built from, in order: a wrapper's or transform's
 * inner schema, a composite's children (an object's fields in key order, a
 * record's key then value, a discriminated union's options), a pipe's two
 * schemas, a `Custom` node's children. A `Leaf` or `Opaque` node has none,
 * and neither has `Lazy`: its schema is reached by calling its getter, so a
 * walk over `children` always ends, even on a recursive schema.
 *
 * @param node The node
 * @returns The schemas it is built from
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { map, pipe, Schema } from "@sekhmet/schema/core/mini";
 * import { children, nodeOf } from "@sekhmet/schema/core/mini/node";
 *
 * const text = new Schema({ parse: (input: unknown) => Ok(String(input)) });
 * const length = new Schema({ parse: (input: string) => Ok(input.length) });
 *
 * assertEquals(children(nodeOf(text)), []);
 * assertEquals(children(nodeOf(pipe(text, length))), [text, length]);
 * assertEquals(children(nodeOf(map(text, (s) => s.trim()))), [text]);
 * ```
 */
export function children(node: SchemaNode): readonly AnySchema[] {
	return match(node)<readonly AnySchema[]>({
		Opaque: () => [],
		Leaf: () => [],
		Optional: ({ inner }) => [inner],
		Nullable: ({ inner }) => [inner],
		Object: ({ shape }) => Object.values(shape).map(fieldSchema),
		Array: ({ item }) => [item],
		Tuple: ({ items }) => items,
		Record: ({ key, value }) => [key, value],
		Union: ({ options }) => options,
		DiscriminatedUnion: ({ options }) => Object.values(options),
		Lazy: () => [],
		Transform: ({ inner }) => [inner],
		Pipe: ({ inner, next }) => [inner, next],
		Readonly: ({ inner }) => [inner],
		Custom: (details) => details.children,
	});
}

/**
 * Defines a kind of `Custom` node, for schemas built outside this package
 * that should still describe themselves: build their nodes with
 * {@linkcode custom}, and read them back with {@linkcode customData}. Hold
 * the kind in a constant; it is told apart from other kinds by identity.
 *
 * @template D The data each node of this kind carries
 * @param options The kind's name, for display
 * @returns The new kind
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isSome } from "@sekhmet/enum/option/mini";
 * import { custom, customData, nodeKind } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<{ currency: string }>({ name: "money" });
 * const other = nodeKind<{ currency: string }>({ name: "money" });
 * const node = custom({ kind: money, data: { currency: "EUR" } });
 *
 * assertEquals(isSome(customData({ node, kind: money })), true);
 * assertEquals(isSome(customData({ node, kind: other })), false);
 * ```
 */
export function nodeKind<D>(options: { readonly name: string }): NodeKind<D> {
	return { name: options.name };
}

/**
 * What {@linkcode custom} builds a node from.
 *
 * @template D The data the node carries
 *
 * @example
 * ```ts
 * import { type CustomOptions, nodeKind } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<string>({ name: "money" });
 * const options: CustomOptions<string> = { kind: money, data: "EUR" };
 * ```
 */
export interface CustomOptions<D> {
	/** The node's kind. */
	readonly kind: NodeKind<D>;
	/** The data it carries. */
	readonly data: D;
	/**
	 * The schemas it is built from, which {@linkcode children} returns.
	 *
	 * @default []
	 */
	readonly children?: readonly AnySchema[];
}

/**
 * Builds a `Custom` node of a kind defined with {@linkcode nodeKind}, for a
 * schema built with `new Schema({ parse, node })`.
 *
 * @template D The data the node carries
 * @param options The node's kind, its data, and the schemas it is built from
 * @returns The node
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 * import { Schema } from "@sekhmet/schema/core/mini";
 * import { custom, customData, nodeKind, nodeOf } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<{ currency: string }>({ name: "money" });
 * const euros = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" ? Ok(input) : Err("not an amount");
 * 	},
 * 	node: custom({ kind: money, data: { currency: "EUR" } }),
 * });
 *
 * assertEquals(unwrap(customData({ node: nodeOf(euros), kind: money })), {
 * 	currency: "EUR",
 * });
 * ```
 */
export function custom<D>(options: CustomOptions<D>): SchemaNode {
	return new SchemaNode(
		"Custom",
		CustomNodeDetails.of({
			kind: options.kind,
			data: options.data,
			children: options.children ?? [],
		}),
	);
}

/**
 * What {@linkcode customData} reads: the node, and the kind to read it as.
 *
 * @template D The kind's data type
 *
 * @example
 * ```ts
 * import { type CustomDataOptions, Opaque, nodeKind } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<string>({ name: "money" });
 * const options: CustomDataOptions<string> = { node: Opaque(), kind: money };
 * ```
 */
export interface CustomDataOptions<D> {
	/** The node to read. */
	readonly node: SchemaNode;
	/** The kind to read it as. */
	readonly kind: NodeKind<D>;
}

/**
 * The data of a `Custom` node of `kind`; `None` for a node of another kind
 * or variant.
 *
 * @template D The kind's data type
 * @param options The node, and the kind to read it as
 * @returns The node's data, when it is of `kind`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { custom, customData, nodeKind, Opaque } from "@sekhmet/schema/core/mini/node";
 *
 * const money = nodeKind<string>({ name: "money" });
 *
 * assertEquals(unwrap(customData({ node: custom({ kind: money, data: "EUR" }), kind: money })), "EUR");
 * assertEquals(isNone(customData({ node: Opaque(), kind: money })), true);
 * ```
 */
export function customData<D>(options: CustomDataOptions<D>): Option<D> {
	const { node, kind } = options;

	return match(node)<Option<D>>({
		Opaque: () => None(),
		Leaf: () => None(),
		Optional: () => None(),
		Nullable: () => None(),
		Object: () => None(),
		Array: () => None(),
		Tuple: () => None(),
		Record: () => None(),
		Union: () => None(),
		DiscriminatedUnion: () => None(),
		Lazy: () => None(),
		Transform: () => None(),
		Pipe: () => None(),
		Readonly: () => None(),
		Custom: (details) => CustomNodeDetails.dataOf({ details, kind }),
	});
}
