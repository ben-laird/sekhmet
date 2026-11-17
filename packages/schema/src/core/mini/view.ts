/**
 * Typed views of a schema's children. A composite, wrapper or transform
 * returns its `Schema` intersected with a _view_: own properties holding the
 * child schemas it was built from, exactly as they were passed (`.shape`,
 * `.item`, `.inner`, …). A view adds no state: its properties are the same
 * references the schema's node holds. Build a viewed schema of your own with
 * {@linkcode viewed}.
 *
 * @module
 */

import { Schema, type SchemaInit } from "./schema.ts";

/**
 * The members of the main `Schema` (its methods and its `with` getter): a
 * view can't use them as keys, since its properties would shadow them.
 *
 * @example
 * ```ts
 * import type { MainSchemaMember } from "@sekhmet/schema/core/mini/view";
 *
 * const member: MainSchemaMember = "map";
 * ```
 */
export type MainSchemaMember =
	| "andThen"
	| "annotate"
	| "array"
	| "filter"
	| "inspect"
	| "inspectErr"
	| "map"
	| "mapErr"
	| "nullable"
	| "optional"
	| "orElse"
	| "parse"
	| "parseAsync"
	| "parseSync"
	| "pipe"
	| "preprocess"
	| "with";

/**
 * The keys a view can't have: the main `Schema`'s members; `schema`, which
 * marks an object shape's field entry (`{ schema, key }`), so a viewed
 * schema in a shape is never mistaken for one; and every symbol, since a
 * schema keeps its params under one (`struct`). A view's keys are names.
 *
 * @example
 * ```ts
 * import type { ReservedViewKey } from "@sekhmet/schema/core/mini/view";
 *
 * const reserved: ReservedViewKey = "schema";
 * ```
 */
export type ReservedViewKey = "schema" | symbol | MainSchemaMember;

/**
 * A view's own properties, with every {@linkcode ReservedViewKey} left
 * out: `Omit<S, ReservedViewKey>` reads the view off a viewed schema.
 *
 * @template S A schema, with or without a view
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 * import type { ViewOf } from "@sekhmet/schema/core/mini/view";
 *
 * type Text = Schema<unknown, string, never>;
 * assertType<IsExact<ViewOf<Text & { readonly inner: Text }>, { readonly inner: Text }>>(
 * 	true,
 * );
 * ```
 */
export type ViewOf<S> = Omit<S, ReservedViewKey>;

/**
 * A view of the schema an `optional`, `nullable` or `readonly` schema wraps:
 * `inner` is that schema, as passed.
 *
 * @template S The wrapped schema
 *
 * @example
 * ```ts
 * import type { Schema } from "@sekhmet/schema/core/mini";
 * import type { WrapperView } from "@sekhmet/schema/core/mini/view";
 *
 * type Text = Schema<unknown, string, never>;
 * type MaybeText = Schema<unknown, string | undefined, never> & WrapperView<Text>;
 * ```
 */
export interface WrapperView<S> {
	/** The wrapped schema, as passed. */
	readonly inner: S;
}

/**
 * A view of the schema a transform (`map`, `mapErr`, `filter`, `andThen`,
 * `orElse`, `inspect`, `inspectErr`, `preprocess`) parses with: `inner` is
 * that schema, as passed.
 *
 * @template S The transformed schema
 *
 * @example
 * ```ts
 * import type { Schema } from "@sekhmet/schema/core/mini";
 * import type { TransformView } from "@sekhmet/schema/core/mini/view";
 *
 * type Text = Schema<unknown, string, never>;
 * type Length = Schema<unknown, number, never> & TransformView<Text>;
 * ```
 */
export interface TransformView<S> {
	/** The schema the transform parses with, as passed. */
	readonly inner: S;
}

/**
 * A view of a pipe's two schemas: `inner` parses first, and `next` parses
 * its output.
 *
 * @template S The first schema
 * @template N The schema its output goes to
 *
 * @example
 * ```ts
 * import type { Schema } from "@sekhmet/schema/core/mini";
 * import type { PipeView } from "@sekhmet/schema/core/mini/view";
 *
 * type Text = Schema<unknown, string, never>;
 * type Digits = Schema<string, number, never>;
 * type Count = Schema<unknown, number, never> & PipeView<Text, Digits>;
 * ```
 */
export interface PipeView<S, N> {
	/** The schema that parses first, as passed. */
	readonly inner: S;
	/** The schema that parses `inner`'s output, as passed. */
	readonly next: N;
}

/**
 * What {@linkcode viewed} builds a schema from: what `new Schema(…)` takes,
 * and the view to put on it.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template V The view
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import type { ViewedOptions } from "@sekhmet/schema/core/mini/view";
 *
 * const options: ViewedOptions<string, string, never, { readonly label: string }> = {
 * 	init: { parse: (input: string) => Ok(input) },
 * 	view: { label: "text" },
 * };
 * ```
 */
export interface ViewedOptions<I, O, E, V extends object> {
	/** The schema's parser, node and annotations. */
	readonly init: SchemaInit<I, O, E>;
	/**
	 * The view: its own properties are copied onto the schema. A reserved
	 * key ({@linkcode ReservedViewKey}) is a type error.
	 */
	readonly view: V & { readonly [K in ReservedViewKey]?: never };
}

/**
 * A schema with a view: `new Schema(init)` with `view`'s own properties
 * copied onto it, so the schema exposes its children typed as passed. A
 * view holds no state of its own; pass the same children the schema's node
 * holds. Use it with `custom()` nodes to give a composite of your own typed
 * children. A reserved key ({@linkcode ReservedViewKey}) is a type error.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template V The view
 * @param options The schema's init, and its view
 * @returns The schema, with the view's properties
 *
 * @example
 * ```ts
 * import { assertStrictEquals } from "@std/assert";
 * import { getStructParams } from "@sekhmet/primordials/struct";
 * import { custom, nodeKind } from "@sekhmet/schema/core/mini/node";
 * import { viewed } from "@sekhmet/schema/core/mini/view";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const Labelled = nodeKind<{ readonly label: string }>({ name: "Labelled" });
 * const text = string();
 * const labelled = viewed({
 * 	init: {
 * 		parse: getStructParams(text).parse,
 * 		node: custom({ kind: Labelled, data: { label: "name" }, children: [text] }),
 * 	},
 * 	view: { text },
 * });
 *
 * assertStrictEquals(labelled.text, text);
 * ```
 */
export function viewed<I, O, E, const V extends object>(
	options: ViewedOptions<I, O, E, V>,
): Schema<I, O, E> & V {
	return Object.assign(new Schema(options.init), options.view);
}
