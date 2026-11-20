/**
 * Schema modifiers: {@linkcode optional} also accepts `undefined`,
 * {@linkcode nullable} also accepts `null`, and {@linkcode lazy} defers
 * building a schema so it can refer to itself, with its {@linkcode LazyView}.
 *
 * @module
 */

import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { settled } from "@/src/core/mini/parsing.ts";
import {
	type ParseOptions,
	parse,
	type Schema,
} from "@/src/core/mini/schema.ts";
import { viewed, type WrapperView } from "@/src/core/mini/view.ts";
import { acceptNull, type Child, type ChildParsed } from "./collect.ts";

/**
 * A view of the schema a `lazy` schema defers to: `getter` is the function
 * passed, typed to return that schema.
 *
 * @template S The schema `getter` returns
 *
 * @example
 * ```ts
 * import { assertStrictEquals } from "@std/assert";
 * import { lazy } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const text = string();
 * const later = lazy(() => text);
 *
 * assertStrictEquals(later.getter(), text);
 * ```
 */
export interface LazyView<S> {
	/** The function returning the schema to parse with, as passed. */
	readonly getter: () => S;
}

/**
 * Makes a schema's value optional: it also accepts `undefined`, which it
 * passes through without running `self`. It does not make an `object` key
 * optional: a field built with `optional` must be present (its value may be
 * `undefined`); declare a key optional with a field entry,
 * `{ schema, key: "optional" }`.
 *
 * The result's view (`.inner`) is `self`, as passed.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema
 * @returns A schema for `self`'s values or `undefined`, viewing `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { array, optional } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: unknown) => Ok(String(input)) });
 * const gaps = array({ item: optional(text) });
 *
 * assertEquals(unwrap(parseSync(gaps, ["a", undefined])), ["a", undefined]);
 * assertEquals(optional(text).inner, text);
 * ```
 */
export function optional<I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
): Schema<I | undefined, O | undefined, E> & WrapperView<S>;
export function optional(self: Child): Child & WrapperView<Child> {
	return viewed({
		init: {
			run: (options: ParseOptions<unknown>): ChildParsed => {
				if (options.input === undefined) return settled(Ok(undefined));

				return parse(self, options);
			},
			node: new SchemaNode("Optional", { inner: self }),
		},
		view: { inner: self },
	});
}

/**
 * Makes a schema also accept `null`, which it passes through without
 * running `self`. The result's view (`.inner`) is `self`, as passed.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema
 * @returns A schema for `self`'s values or `null`, viewing `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { nullable } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: unknown) => Ok(String(input)) });
 *
 * assertEquals(unwrap(parseSync(nullable(text), null)), null);
 * ```
 */
export function nullable<I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
): Schema<I | null, O | null, E> & WrapperView<S>;
export function nullable(self: Child): Child & WrapperView<Child> {
	return viewed({
		init: getStructParams(acceptNull(self)),
		view: { inner: self },
	});
}

/**
 * Defers building a schema until it parses, so a schema can refer to
 * itself: recursive data such as trees. `getter` runs on every parse; the
 * types must be written out, since TypeScript can't infer a recursive one.
 * The result's view (`.getter`) is `getter`, as passed.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema `getter` returns, exactly
 * @param getter Returns the schema to parse with
 * @returns A schema that parses with `getter()`'s schema, viewing `getter`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { array, lazy, object } from "@sekhmet/schema/composites/mini";
 * import { type Issues, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * interface Tree {
 * 	children: Tree[];
 * }
 * const tree: Schema<unknown, Tree, Issues<unknown>> = object({
 * 	shape: { children: array({ item: lazy(() => tree) }) },
 * });
 *
 * assertEquals(unwrap(parseSync(tree, { children: [{ children: [] }] })), {
 * 	children: [{ children: [] }],
 * });
 * ```
 */
export function lazy<I, O, E, S extends Schema<I, O, E>>(
	getter: () => S & Schema<I, O, E>,
): Schema<I, O, E> & LazyView<S>;
export function lazy(getter: () => Child): Child & LazyView<Child> {
	return viewed({
		init: {
			run: (options: ParseOptions<unknown>) => parse(getter(), options),
			node: new SchemaNode("Lazy", { getter }),
		},
		view: { getter },
	});
}
