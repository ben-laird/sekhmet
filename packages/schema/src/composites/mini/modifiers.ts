import { Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { Schema } from "@/src/core/mini/schema.ts";
import { acceptNull, type Child, type ChildParsed, wrap } from "./collect.ts";

/**
 * Makes a schema's value optional: it also accepts `undefined`, which it
 * passes through without running `self`. It does not make an `object` key
 * optional: a field built with `optional` must be present (its value may be
 * `undefined`); declare a key optional with a field entry,
 * `{ schema, key: "optional" }`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema
 * @returns A schema for `self`'s values or `undefined`
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
 * ```
 */
export function optional<I, O, E>(
	self: Schema<I, O, E>,
): Schema<I | undefined, O | undefined, E>;
export function optional(self: Child): Child {
	const parser = getStructParams(self).parse;

	return wrap({
		modifier: "optional",
		inner: self,
		parser: (input): ChildParsed => {
			if (input === undefined) return Ok(undefined);

			return parser(input);
		},
	});
}

/**
 * Makes a schema also accept `null`, which it passes through without
 * running `self`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema
 * @returns A schema for `self`'s values or `null`
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
export function nullable<I, O, E>(
	self: Schema<I, O, E>,
): Schema<I | null, O | null, E>;
export function nullable(self: Child): Child {
	return acceptNull(self);
}

/**
 * Defers building a schema until it parses, so a schema can refer to
 * itself: recursive data such as trees. `getter` runs on every parse; the
 * types must be written out, since TypeScript can't infer a recursive one.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param getter Returns the schema to parse with
 * @returns A schema that parses with `getter()`'s schema
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
export function lazy<I, O, E>(getter: () => Schema<I, O, E>): Schema<I, O, E> {
	return new Schema({
		parse: (input) => getStructParams(getter()).parse(input),
	});
}
