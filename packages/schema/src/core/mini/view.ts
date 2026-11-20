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
 * A record keyed by every reserved view key that is a name: the type of
 * {@linkcode RESERVED_VIEW_NAMES}.
 *
 * @example
 * ```ts
 * import type { ReservedViewNames } from "@sekhmet/schema/core/mini/view";
 *
 * type Reserved = keyof ReservedViewNames; // "schema" | "map" | …
 * ```
 */
export type ReservedViewNames = {
	readonly [K in Exclude<ReservedViewKey, symbol>]: true;
};

/**
 * The reserved view keys that are names: `schema` and every
 * {@linkcode MainSchemaMember}, as a frozen record keyed by them. Its type
 * names every one, so a name added to {@linkcode MainSchemaMember} must be
 * added here, and {@linkcode viewed} panics on each at runtime.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { RESERVED_VIEW_NAMES } from "@sekhmet/schema/core/mini/view";
 *
 * assertEquals(Object.hasOwn(RESERVED_VIEW_NAMES, "map"), true);
 * assertEquals(Object.hasOwn(RESERVED_VIEW_NAMES, "shape"), false);
 * ```
 */
export const RESERVED_VIEW_NAMES: ReservedViewNames =
	Object.freeze<ReservedViewNames>({
		schema: true,
		andThen: true,
		annotate: true,
		array: true,
		filter: true,
		inspect: true,
		inspectErr: true,
		map: true,
		mapErr: true,
		nullable: true,
		optional: true,
		orElse: true,
		parse: true,
		parseSync: true,
		pipe: true,
		preprocess: true,
		with: true,
	});

/**
 * Panics with a `TypeError` unless every own key of `view` may be a view's:
 * not a symbol, not a reserved name ({@linkcode RESERVED_VIEW_NAMES}), and
 * not `__proto__`, which `Object.assign` would set as the prototype. The
 * types already reject these; a view widened by assignment can still carry
 * them, and copying one would replace a schema's params or shadow a method.
 */
function assertViewKeys(view: object): void {
	if (Object.getOwnPropertySymbols(view).length > 0) {
		throw new TypeError("viewed: a view can't have symbol keys");
	}
	for (const key of Object.keys(view)) {
		if (Object.hasOwn(RESERVED_VIEW_NAMES, key) || key === "__proto__") {
			throw new TypeError(`viewed: "${key}" is reserved, not a view key`);
		}
	}
}

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
 * import { assertStrictEquals } from "@std/assert";
 * import { nullable, optional } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const text = string();
 * const maybe = optional(text);
 *
 * assertStrictEquals(maybe.inner, text);
 * assertStrictEquals(nullable(maybe).inner.inner, text);
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
 * import { assertStrictEquals } from "@std/assert";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { map } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const name = string();
 * const user = object({ shape: { name } });
 * const greeting = map(user, (value) => `Hello, ${value.name}`);
 *
 * assertStrictEquals(greeting.inner.shape.name, name);
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
 * import { assertStrictEquals } from "@std/assert";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { pipe, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: unknown) => Ok(String(input)) });
 * const length = new Schema({ parse: (input: string) => Ok(input.length) });
 * const counted = pipe(text, length);
 *
 * assertStrictEquals(counted.inner, text);
 * assertStrictEquals(counted.next, length);
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
	 * The view: its own enumerable properties are copied onto the schema. A
	 * reserved key ({@linkcode ReservedViewKey}) is a type error, and a
	 * panic at runtime.
	 */
	readonly view: V & { readonly [K in ReservedViewKey]?: never };
}

/**
 * A schema with a view: `new Schema(init)` with `view`'s own properties
 * copied onto it, so the schema exposes its children typed as passed. A
 * view holds no state of its own; pass the same children the schema's node
 * holds. Use it with `custom()` nodes to give a composite of your own typed
 * children. A reserved key ({@linkcode ReservedViewKey}) is a type error;
 * since a view widened by assignment can still carry one, `viewed` also
 * panics with a `TypeError` on a symbol key, a reserved name or
 * `__proto__`, rather than let it replace the schema's params or shadow a
 * method.
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
 * 		run: getStructParams(text).run,
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
	assertViewKeys(options.view);

	return Object.assign(new Schema(options.init), options.view);
}
