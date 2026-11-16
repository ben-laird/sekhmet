import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

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
	 * If true, coerce non-number values to numbers using Number().
	 * If false, non-number values will fail with an `InvalidType` issue.
	 *
	 * @default false
	 */
	coerce?: boolean;

	/**
	 * Optional range constraint for the number.
	 * If provided, numbers outside this range will fail with an `InvalidType` issue.
	 */
	range?: Range;
}

/**
 * Creates a schema that validates and optionally coerces numeric values.
 *
 * By default, this schema only accepts number inputs and fails with an `InvalidType` issue
 * for non-number values. With `coerce: true`, it will convert any input to
 * a number using the Number() function.
 *
 * @param options Configuration options
 * @returns A schema that validates numeric inputs
 *
 * @example
 * ```ts
 * import { number } from "@sekhmet/schema/primitives/mini/number";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = number();
 * parseSync(schema, 42); // Ok(42)
 * parseSync(schema, "123"); // Err(InvalidType)
 * ```
 *
 * @example
 * ```ts
 * import { number } from "@sekhmet/schema/primitives/mini/number";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = number({ coerce: true });
 * parseSync(schema, "123"); // Ok(123)
 * parseSync(schema, true); // Ok(1)
 * ```
 */
export function number(
	options?: NumberSchemaOptions,
): Schema<unknown, number, SchemaIssue> {
	const coerce = options?.coerce ?? false;

	return new Schema((input) => {
		if (typeof input !== "number") {
			if (coerce) {
				return Ok(Number(input));
			}

			return Err(InvalidType({ input, expected: "number" }));
		}

		return Ok(input);
	});
}
