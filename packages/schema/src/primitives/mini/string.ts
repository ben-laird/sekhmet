import { Ok, Err } from "@sekhmet/enum/result/mini";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Options for configuring the string schema.
 */
export interface StringSchemaOptions {
	/**
	 * If true, coerce non-string values to strings using String().
	 * If false, non-string values will result in a TypeError.
	 *
	 * @default false
	 */
	coerce?: boolean;
}

/**
 * Creates a schema that validates and optionally coerces string values.
 *
 * By default, this schema only accepts string inputs and returns a TypeError
 * for non-string values. With `coerce: true`, it will convert any input to
 * a string using the String() function.
 *
 * @param options Configuration options
 * @returns A schema that validates string inputs
 *
 * @example
 * ```ts
 * import { string } from "@sekhmet/schema/primitives/mini/string";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = string();
 * parseSync(schema, "hello"); // Ok("hello")
 * parseSync(schema, 123); // Err(TypeError)
 * ```
 *
 * @example
 * ```ts
 * import { string } from "@sekhmet/schema/primitives/mini/string";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = string({ coerce: true });
 * parseSync(schema, 123); // Ok("123")
 * parseSync(schema, true); // Ok("true")
 * ```
 */
export function string({
	coerce = false,
}: StringSchemaOptions = {}): Schema<unknown, string, TypeError> {
	return new Schema((input) => {
		if (typeof input !== "string") {
			if (coerce) {
				return Ok(String(input));
			}

			return Err(new TypeError());
		}

		return Ok(input);
	});
}
