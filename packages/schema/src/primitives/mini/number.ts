import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { CoerceMode } from "./coerce.ts";
import { coerceNumber } from "./convert.ts";

/**
 * Represents a numeric bound with inclusivity.
 *
 * The first element is the numeric value, the second indicates whether
 * the bound is inclusive or non-inclusive (exclusive).
 */
export type Bound = [number, "inclusive" | "non-inclusive"];

/**
 * Represents a numeric range with minimum and maximum bounds.
 */
export interface Range {
	/**
	 * The minimum bound of the range.
	 */
	min: Bound;

	/**
	 * The maximum bound of the range.
	 */
	max: Bound;
}

/**
 * Options for configuring the number schema.
 */
export interface NumberSchemaOptions {
	/**
	 * How a non-number is treated (see {@linkcode CoerceMode}): rejected
	 * (`false`), strictly coerced (`true`: trimmed decimal or exponent
	 * strings, booleans as 1/0, bigints in the safe-integer range), or
	 * converted with `Number()` (`"native"`). A coerced value is still
	 * checked, so `NaN` from `Number("abc")` fails unless `nan: true`.
	 *
	 * @default false
	 */
	coerce?: CoerceMode;

	/**
	 * Whether `NaN` is accepted. By default it fails with an `InvalidType`
	 * issue (received `"nan"`).
	 *
	 * @default false
	 */
	nan?: boolean;

	/**
	 * Whether `Infinity` and `-Infinity` are accepted. By default they fail
	 * with an `InvalidType` issue (received `"infinity"`).
	 *
	 * @default false
	 */
	infinite?: boolean;

	/**
	 * A range the number must fall in: a value below `min` fails with
	 * `TooSmall`, one above `max` with `TooBig`.
	 */
	range?: Range;
}

/** The issue a number violates, if any, under the schema's options. */
function violation(
	value: number,
	options: NumberSchemaOptions | undefined,
): SchemaIssue | undefined {
	if (Number.isNaN(value)) {
		return options?.nan === true
			? undefined
			: InvalidType({ input: value, expected: "number" });
	}
	if (!Number.isFinite(value) && options?.infinite !== true) {
		return InvalidType({ input: value, expected: "number" });
	}

	const range = options?.range;
	if (range === undefined) return undefined;

	const [minimum, lower] = range.min;
	const [maximum, upper] = range.max;
	const minInclusive = lower === "inclusive";
	const maxInclusive = upper === "inclusive";
	if (minInclusive ? value < minimum : value <= minimum) {
		return TooSmall({
			input: value,
			origin: "number",
			minimum,
			inclusive: minInclusive,
		});
	}
	if (maxInclusive ? value > maximum : value >= maximum) {
		return TooBig({
			input: value,
			origin: "number",
			maximum,
			inclusive: maxInclusive,
		});
	}

	return undefined;
}

/**
 * Creates a schema that validates and optionally coerces numeric values.
 *
 * It is strict by default: it accepts only finite numbers (`-0` included),
 * failing with an `InvalidType` issue otherwise. `nan: true` and
 * `infinite: true` allow `NaN` and `±Infinity`, and `range` bounds the
 * value. Chain {@linkcode int}, {@linkcode safe}, {@linkcode multipleOf},
 * {@linkcode min} and {@linkcode max} for further checks.
 *
 * `coerce: true` also accepts trimmed decimal or exponent strings
 * (`" 12 "`, `"1e3"`), booleans as 1/0 and bigints in the safe-integer
 * range, and rejects `""`, `"0x10"`, `null`, `undefined`, `[]` and `{}`.
 * `coerce: "native"` uses `Number()` instead, whose result is still
 * checked.
 *
 * @param options Configuration options
 * @returns A schema that validates numeric inputs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const schema = number();
 *
 * assertEquals(unwrap(parseSync(schema, 42)), 42);
 * assertEquals(isErr(parseSync(schema, Number.NaN)), true);
 * assertEquals(isErr(parseSync(schema, "42")), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const ratio = number({
 * 	range: { min: [0, "inclusive"], max: [1, "non-inclusive"] },
 * });
 *
 * assertEquals(isOk(parseSync(ratio, 0)), true);
 * assertEquals(isErr(parseSync(ratio, 1)), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const strict = number({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, " 1e3 ")), 1000);
 * assertEquals(isErr(parseSync(strict, "")), true);
 *
 * const native = number({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, "")), 0);
 * assertEquals(isErr(parseSync(native, "abc")), true);
 * ```
 */
export function number(
	options?: NumberSchemaOptions,
): Schema<unknown, number, SchemaIssue> {
	const mode = options?.coerce ?? false;

	return new Schema((input): Result<number, SchemaIssue> => {
		const value = coerceNumber(input, mode);
		if (value === undefined) {
			return Err(InvalidType({ input, expected: "number" }));
		}

		const issue = violation(value, options);

		return issue === undefined ? Ok(value) : Err(issue);
	});
}
