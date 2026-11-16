import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { CoerceMode } from "./coerce.ts";
import { coerceString } from "./convert.ts";

/**
 * Options for configuring the string schema.
 */
export interface StringSchemaOptions {
	/**
	 * How a non-string is treated (see {@linkcode CoerceMode}): rejected
	 * (`false`), strictly coerced (`true`: finite numbers, bigints and
	 * booleans), or converted with `String()` (`"native"`).
	 *
	 * @default false
	 */
	coerce?: CoerceMode;
}

/**
 * Creates a schema that validates and optionally coerces string values.
 *
 * By default it accepts only strings, failing with an `InvalidType` issue
 * otherwise. `coerce: true` also accepts finite numbers, bigints and
 * booleans, as their `String()` form; `null`, `undefined`, `NaN`, objects
 * and symbols still fail. `coerce: "native"` converts anything `String()`
 * can.
 *
 * @param options Configuration options
 * @returns A schema that validates string inputs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(unwrap(parseSync(string(), "hello")), "hello");
 * assertEquals(isErr(parseSync(string(), 123)), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const strict = string({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, 123)), "123");
 * assertEquals(isErr(parseSync(strict, null)), true);
 *
 * const native = string({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, null)), "null");
 * ```
 */
export function string(
	options?: StringSchemaOptions,
): Schema<unknown, string, SchemaIssue> {
	const mode = options?.coerce ?? false;

	return new Schema((input): Result<string, SchemaIssue> => {
		const value = coerceString(input, mode);

		return value === undefined
			? Err(InvalidType({ input, expected: "string" }))
			: Ok(value);
	});
}
