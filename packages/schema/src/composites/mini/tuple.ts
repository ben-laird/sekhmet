import { type SchemaIssue, TooBig } from "@/src/core/mini/issue.ts";
import {
	type Flatten,
	fromError,
	type Issues,
} from "@/src/core/mini/issues.ts";
import {
	type AnySchema,
	type ErrorOf,
	type Input,
	type Output,
	Schema,
} from "@/src/core/mini/schema.ts";
import {
	type Child,
	compose,
	invalidType,
	isArray,
	type Parsed,
	run,
} from "./collect.ts";

/**
 * The input a tuple schema accepts: `unknown` when every element accepts
 * anything, and otherwise a tuple of the elements' inputs.
 *
 * @template T The element schemas
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { TupleInput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Pair = TupleInput<[Schema<string, string, Error>, Schema<unknown, number, Error>]>;
 * assertType<IsExact<Pair, readonly [string, unknown]>>(true);
 * ```
 */
export type TupleInput<T extends readonly AnySchema[]> = [
	{
		[K in keyof T]: unknown extends Input<T[K]> ? never : K;
	}[number],
] extends [never]
	? unknown
	: { readonly [K in keyof T]: Input<T[K]> };

/**
 * The output of a tuple schema: a tuple of the elements' outputs.
 *
 * @template T The element schemas
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { TupleOutput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Pair = TupleOutput<[Schema<unknown, string, Error>, Schema<unknown, number, Error>]>;
 * assertType<IsExact<Pair, [string, number]>>(true);
 * ```
 */
export type TupleOutput<T extends readonly AnySchema[]> = {
	-readonly [K in keyof T]: Output<T[K]>;
};

/**
 * The error of a tuple schema: every element's errors, flattened, plus the
 * `SchemaIssue`s the tuple reports itself (`InvalidType`, `TooBig`).
 *
 * @template T The element schemas
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { TupleError } from "@sekhmet/schema/composites/mini";
 * import type { Issues, Schema, SchemaIssue } from "@sekhmet/schema/core/mini";
 *
 * type Errors = TupleError<[Schema<unknown, string, "a">, Schema<unknown, number, "b">]>;
 * assertType<IsExact<Errors, Issues<"a" | "b" | SchemaIssue>>>(true);
 * ```
 */
export type TupleError<T extends readonly AnySchema[]> = Issues<
	Flatten<ErrorOf<T[number]>> | SchemaIssue
>;

/**
 * Creates a schema for fixed-length arrays: element `i` is parsed by
 * `items[i]`, and every failing element is reported at its index.
 *
 * A missing element is parsed as `undefined`, so a short input fails at
 * each required element it lacks. Elements past the end of `items` fail
 * with a `TooBig` issue (origin `"array"`) at the root: a tuple has no rest
 * element; use `array` for a variable-length tail. A non-array input fails
 * with an `InvalidType` issue at the root.
 *
 * @template T The element schemas
 * @param items Each element's schema, in order
 * @returns A schema for tuples of `items`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { tuple } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "string" ? Ok(input) : Err("not text");
 * 	},
 * });
 * const count = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" ? Ok(input) : Err("not a number");
 * 	},
 * });
 *
 * assertEquals(unwrap(parseSync(tuple([text, count]), ["apples", 3])), ["apples", 3]);
 * ```
 */
export function tuple<const T extends readonly AnySchema[]>(
	items: T,
): Schema<TupleInput<T>, TupleOutput<T>, TupleError<T>>;
export function tuple(
	items: readonly Child[],
): Schema<unknown, unknown, Issues<unknown>> {
	return new Schema({
		parse: (input: unknown): Parsed => {
			if (!isArray(input)) return invalidType({ input, expected: "array" });

			return compose({
				pending: items.map((child, index) =>
					run({ key: index, child, value: input[index] }),
				),
				extra:
					input.length > items.length
						? fromError(
								TooBig({
									input,
									origin: "array",
									maximum: items.length,
									inclusive: true,
								}),
							)
						: undefined,
				build: (outputs) => outputs.map(([, output]) => output),
			});
		},
	});
}
