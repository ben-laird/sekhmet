import { match, union } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { type SchemaIssue, TooBig, TooSmall } from "@/src/core/mini/issue.ts";
import {
	concat,
	type Flatten,
	fromError,
	type Issues,
	toIssues,
} from "@/src/core/mini/issues.ts";
import { map as mapPotential } from "@/src/core/mini/potential.ts";
import { parse, Schema } from "@/src/core/mini/schema.ts";
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
 * Creates a schema for arrays whose every element `item` accepts. Every
 * element is parsed, and every failing element is reported at its index.
 * A non-array input fails with an `InvalidType` issue at the root.
 *
 * The input is `unknown` when `item` accepts anything, and otherwise an
 * array of `item`'s input.
 *
 * @template I The element schema's input type
 * @template O The element schema's output type
 * @template E The element schema's error type
 * @param item The schema for each element
 * @returns A schema for arrays of `item`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { array } from "@sekhmet/schema/composites/mini";
 * import { entries, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const positive = new Schema((input: unknown) =>
 * 	typeof input === "number" && input > 0 ? Ok(input) : Err("not positive"),
 * );
 * const issues = unwrapErr(await parseAsync(array(positive), [1, -2, 3, 0]));
 *
 * assertEquals(entries(issues).map(({ path }) => path), [[1], [3]]);
 * ```
 */
export function array<I, O, E>(
	item: Schema<I, O, E>,
): Schema<ArrayInput<I>, O[], Issues<Flatten<E> | SchemaIssue>>;
export function array(item: Child): Schema<unknown, unknown, Issues<unknown>> {
	return new Schema((input: unknown): Parsed => {
		if (!isArray(input)) return invalidType({ input, expected: "array" });

		return compose({
			pending: input.map((value, index) =>
				run({ key: index, child: item, value }),
			),
			extra: undefined,
			build: (outputs) => outputs.map(([, output]) => output),
		});
	});
}

/** Adds a length issue to a parse's result, when `tooFar` finds one. */
function checkLength<I, O extends readonly unknown[], E>(
	self: Schema<I, O, E>,
	tooFar: (input: unknown, length: number) => SchemaIssue | undefined,
): Schema<I, O, Issues<Flatten<E> | SchemaIssue>> {
	return new Schema((input) =>
		union(
			mapPotential(parse(self, input), (result) =>
				match(result)({
					Ok: (output): Result<O, Issues<Flatten<E> | SchemaIssue>> => {
						const issue = tooFar(input, output.length);
						return issue === undefined ? Ok(output) : Err(fromError(issue));
					},
					Err: (error) => {
						const issues = toIssues(error);
						const issue = isArray(input)
							? tooFar(input, input.length)
							: undefined;
						return Err(
							issue === undefined ? issues : concat(issues, fromError(issue)),
						);
					},
				}),
			),
		),
	);
}

/**
 * Requires an array schema's output to have at least `minimum` elements,
 * failing with a `TooSmall` issue (origin `"array"`) at the root. When the
 * array also has failing elements and its input is too short, both are
 * reported.
 *
 * @template I The input type
 * @template O The array output type
 * @template E The error type
 * @param self The array schema
 * @param minimum The fewest elements allowed (inclusive)
 * @returns The schema, with the length check
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { array, minItems } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const anything = new Schema((input: unknown) => Ok(input));
 * const nonEmpty = minItems(array(anything), 1);
 * const [{ error }] = entries(unwrapErr(await parseAsync(nonEmpty, [])));
 *
 * assertEquals(formatIssue(error), "Too small: expected array to have >= 1 items");
 * ```
 */
export function minItems<I, O extends readonly unknown[], E>(
	self: Schema<I, O, E>,
	minimum: number,
): Schema<I, O, Issues<Flatten<E> | SchemaIssue>> {
	return checkLength(self, (input, length) =>
		length < minimum
			? TooSmall({ input, origin: "array", minimum, inclusive: true })
			: undefined,
	);
}

/**
 * Requires an array schema's output to have at most `maximum` elements,
 * failing with a `TooBig` issue (origin `"array"`) at the root, mirroring
 * {@linkcode minItems}.
 *
 * @template I The input type
 * @template O The array output type
 * @template E The error type
 * @param self The array schema
 * @param maximum The most elements allowed (inclusive)
 * @returns The schema, with the length check
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { array, maxItems } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const anything = new Schema((input: unknown) => Ok(input));
 * const pair = maxItems(array(anything), 2);
 * const [{ error }] = entries(unwrapErr(await parseAsync(pair, [1, 2, 3])));
 *
 * assertEquals(formatIssue(error), "Too big: expected array to have <= 2 items");
 * ```
 */
export function maxItems<I, O extends readonly unknown[], E>(
	self: Schema<I, O, E>,
	maximum: number,
): Schema<I, O, Issues<Flatten<E> | SchemaIssue>> {
	return checkLength(self, (input, length) =>
		length > maximum
			? TooBig({ input, origin: "array", maximum, inclusive: true })
			: undefined,
	);
}
