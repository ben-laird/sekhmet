import { Ok, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { MaybePromise } from "@/src/core/mini/potential.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Makes a schema also accept `undefined`, which it passes through without
 * running `self`. In an `object`, a field built with `optional` may be
 * missing, and becomes an optional property.
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
 * import { object, optional } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema((input: unknown) => Ok(String(input)));
 * const user = object({ shape: { nickname: optional(text) } });
 *
 * assertEquals(unwrap(parseSync(user, {})), {});
 * ```
 */
export function optional<I, O, E>(
	self: Schema<I, O, E>,
): Schema<I | undefined, O | undefined, E> {
	const parser = getStructParams(self);

	return new Schema(
		(input): MaybePromise<Result<O | undefined, E>> =>
			input === undefined ? Ok(undefined) : parser(input),
	);
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
 * const text = new Schema((input: unknown) => Ok(String(input)));
 *
 * assertEquals(unwrap(parseSync(nullable(text), null)), null);
 * ```
 */
export function nullable<I, O, E>(
	self: Schema<I, O, E>,
): Schema<I | null, O | null, E> {
	const parser = getStructParams(self);

	return new Schema(
		(input): MaybePromise<Result<O | null, E>> =>
			input === null ? Ok(null) : parser(input),
	);
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
	return new Schema((input) => getStructParams(getter())(input));
}
