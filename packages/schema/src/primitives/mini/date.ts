import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts only valid `Date` objects. Anything else,
 * including an `Invalid Date` (one whose time is `NaN`), fails with an
 * `InvalidType` issue; the issue's `received` tells the two apart
 * (`"invalid date"`). It does not coerce: a date string or a timestamp is
 * rejected. The accepted `Date` is returned as is, not copied.
 *
 * @returns A schema accepting only valid dates
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { date } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(date(), new Date(0))), true);
 * assertEquals(isErr(parseSync(date(), new Date("nope"))), true);
 * assertEquals(isErr(parseSync(date(), "1970-01-01")), true);
 * ```
 */
export function date(): Schema<unknown, Date, SchemaIssue> {
	return new Schema(
		(input): Result<Date, SchemaIssue> =>
			input instanceof Date && !Number.isNaN(input.getTime())
				? Ok(input)
				: Err(InvalidType({ input, expected: "date" })),
	);
}
