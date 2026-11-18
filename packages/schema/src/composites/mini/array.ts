/**
 * The array composite: {@linkcode array} builds a schema for arrays whose
 * every element one schema accepts, reporting each failing element at its
 * index, with its {@linkcode ArrayOptions}, {@linkcode ArrayInput} type and
 * {@linkcode ArrayView}.
 *
 * @module
 */

import { type SchemaIssue, TooBig, TooSmall } from "@/src/core/mini/issue.ts";
import {
	type Flatten,
	fromError,
	type Issues,
} from "@/src/core/mini/issues.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { viewed } from "@/src/core/mini/view.ts";
import {
	type Child,
	compose,
	invalidType,
	isArray,
	type Parsed,
	run,
} from "./collect.ts";

/**
 * The input an array schema accepts: `unknown` when its element schema
 * accepts anything, and otherwise an array of the element's input.
 *
 * @template I The element schema's input type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ArrayInput } from "@sekhmet/schema/composites/mini";
 *
 * assertType<IsExact<ArrayInput<unknown>, unknown>>(true);
 * assertType<IsExact<ArrayInput<string>, readonly string[]>>(true);
 * ```
 */
export type ArrayInput<I> = unknown extends I ? unknown : readonly I[];

/**
 * What {@linkcode array} builds a schema from: the element schema, and
 * bounds on the array's length.
 *
 * @template I The element schema's input type
 * @template O The element schema's output type
 * @template E The element schema's error type
 * @template S The element schema, exactly (with its own view)
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import type { ArrayOptions } from "@sekhmet/schema/composites/mini";
 * import { Schema } from "@sekhmet/schema/core/mini";
 *
 * const tags: ArrayOptions<unknown, unknown, never> = {
 * 	item: new Schema({ parse: (input: unknown) => Ok(input) }),
 * 	minItems: 1,
 * };
 * ```
 */
export interface ArrayOptions<
	I,
	O,
	E,
	S extends Schema<I, O, E> = Schema<I, O, E>,
> {
	/** The schema for each element. */
	readonly item: S & Schema<I, O, E>;
	/**
	 * The fewest elements allowed (inclusive); a shorter array fails with a
	 * `TooSmall` issue (origin `"array"`) at the root.
	 */
	readonly minItems?: number;
	/**
	 * The most elements allowed (inclusive); a longer array fails with a
	 * `TooBig` issue (origin `"array"`) at the root.
	 */
	readonly maxItems?: number;
}

/**
 * A view of an array schema's element schema: `item` is the schema passed.
 *
 * @template S The element schema
 *
 * @example
 * ```ts
 * import { assertStrictEquals } from "@std/assert";
 * import { array } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const tag = string();
 *
 * assertStrictEquals(array({ item: tag }).item, tag);
 * ```
 */
export interface ArrayView<S> {
	/** The schema for each element, as passed. */
	readonly item: S;
}

/** The length issue of an array, if its length is out of bounds. */
function lengthIssue({
	input,
	minItems,
	maxItems,
}: {
	input: readonly unknown[];
	minItems: number | undefined;
	maxItems: number | undefined;
}): Issues<SchemaIssue> | undefined {
	const { length } = input;
	if (minItems !== undefined && length < minItems) {
		return fromError(
			TooSmall({ input, origin: "array", minimum: minItems, inclusive: true }),
		);
	}
	if (maxItems !== undefined && length > maxItems) {
		return fromError(
			TooBig({ input, origin: "array", maximum: maxItems, inclusive: true }),
		);
	}

	return undefined;
}

/**
 * Creates a schema for arrays whose every element `item` accepts. Every
 * element is parsed, and every failing element is reported at its index.
 * A non-array input fails with an `InvalidType` issue at the root.
 *
 * `minItems` and `maxItems` bound the length (JSON Schema's names, apart
 * from the string length options). A length out of bounds is reported at
 * the root, after any failing elements, so both are seen at once.
 *
 * The input is `unknown` when `item` accepts anything, and otherwise an
 * array of `item`'s input. The result's view (`.item`) is `item`, as
 * passed.
 *
 * @template I The element schema's input type
 * @template O The element schema's output type
 * @template E The element schema's error type
 * @template S The element schema, exactly (with its own view)
 * @param options The element schema and the length bounds
 * @returns A schema for arrays of `item`, viewing `item`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { array } from "@sekhmet/schema/composites/mini";
 * import { entries, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const positive = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" && input > 0 ? Ok(input) : Err("not positive");
 * 	},
 * });
 * const found = unwrapErr(await parseAsync(array({ item: positive }), [1, -2, 3, 0]));
 *
 * assertEquals(entries(found).map(({ path }) => path), [[1], [3]]);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { array } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const anything = new Schema({ parse: (input: unknown) => Ok(input) });
 * const pair = array({ item: anything, minItems: 1, maxItems: 2 });
 * const [{ error }] = entries(unwrapErr(await parseAsync(pair, [1, 2, 3])));
 *
 * assertEquals(formatIssue(error), "Too big: expected array to have <= 2 items");
 * ```
 */
export function array<I, O, E, S extends Schema<I, O, E>>(
	options: ArrayOptions<I, O, E, S>,
): Schema<ArrayInput<I>, O[], Issues<Flatten<E> | SchemaIssue>> & ArrayView<S>;
export function array(options: {
	readonly item: Child;
	readonly minItems?: number;
	readonly maxItems?: number;
}): Schema<unknown, unknown, Issues<unknown>> & ArrayView<Child> {
	const { item, minItems, maxItems } = options;
	const parse = (input: unknown): Parsed => {
		if (!isArray(input)) return invalidType({ input, expected: "array" });

		return compose({
			pending: input.map((value, index) => {
				return run({ key: index, child: item, value });
			}),
			extra: lengthIssue({ input, minItems, maxItems }),
			build: (outputs) => outputs.map(([, output]) => output),
		});
	};

	return viewed({
		init: {
			parse,
			node: new SchemaNode("Array", { item, minItems, maxItems }),
		},
		view: { item },
	});
}
