import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Options for configuring the boolean schema.
 */
export interface BooleanSchemaOptions {
	/**
	 * If true, coerce non-boolean values to booleans using Boolean().
	 * If false, non-boolean values will fail with an `InvalidType` issue.
	 *
	 * @default false
	 */
	coerce?: boolean;
}

/**
 * Creates a schema that validates and optionally coerces boolean values.
 *
 * By default, this schema only accepts boolean inputs and fails with an `InvalidType` issue
 * for non-boolean values. With `coerce: true`, it will convert any input to
 * a boolean using the Boolean() function.
 *
 * @param options Configuration options
 * @returns A schema that validates boolean inputs
 *
 * @example
 * ```ts
 * import { boolean } from "@sekhmet/schema/primitives/mini/boolean";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = boolean();
 * parseSync(schema, true); // Ok(true)
 * parseSync(schema, "true"); // Err(InvalidType)
 * ```
 *
 * @example
 * ```ts
 * import { boolean } from "@sekhmet/schema/primitives/mini/boolean";
 * import { parseSync } from "@sekhmet/schema/core/mini/schema";
 *
 * const schema = boolean({ coerce: true });
 * parseSync(schema, "true"); // Ok(true)
 * parseSync(schema, 0); // Ok(false)
 * parseSync(schema, 1); // Ok(true)
 * ```
 */
export function boolean(
	options?: BooleanSchemaOptions,
): Schema<unknown, boolean, SchemaIssue> {
	const coerce = options?.coerce ?? false;

	return new Schema((input) => {
		if (typeof input !== "boolean") {
			if (coerce) {
				return Ok(Boolean(input));
			}

			return Err(InvalidType({ input, expected: "boolean" }));
		}

		return Ok(input);
	});
}
