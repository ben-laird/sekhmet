import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { CoerceMode } from "./coerce.ts";
import { coerceBoolean } from "./convert.ts";

/**
 * Options for configuring the boolean schema.
 */
export interface BooleanSchemaOptions {
	/**
	 * How a non-boolean is treated (see {@linkcode CoerceMode}): rejected
	 * (`false`), strictly coerced (`true`: `0`/`1`, `0n`/`1n` and
	 * `stringbool`'s default words), or converted with `Boolean()`
	 * (`"native"`).
	 *
	 * @default false
	 */
	coerce?: CoerceMode;
}

/**
 * Creates a schema that validates and optionally coerces boolean values.
 *
 * By default it accepts only booleans, failing with an `InvalidType` issue
 * otherwise. `coerce: true` also accepts `0`/`1`, `0n`/`1n` and
 * `stringbool`'s default words (so `"false"` is `false`); anything else,
 * such as `"maybe"`, `2` or `null`, still fails. `coerce: "native"` uses
 * `Boolean()`, so every value converts and `"false"` is `true`.
 *
 * To read strings from env vars, query params or forms, prefer
 * `stringbool()`, which accepts only strings and takes its own word lists.
 *
 * @param options Configuration options
 * @returns A schema that validates boolean inputs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { boolean } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(unwrap(parseSync(boolean(), true)), true);
 * assertEquals(isErr(parseSync(boolean(), "true")), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { boolean } from "@sekhmet/schema/primitives/mini";
 *
 * const strict = boolean({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, "false")), false);
 * assertEquals(unwrap(parseSync(strict, 1)), true);
 * assertEquals(isErr(parseSync(strict, "maybe")), true);
 *
 * const native = boolean({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, "false")), true);
 * ```
 */
export function boolean(
	options?: BooleanSchemaOptions,
): Schema<unknown, boolean, SchemaIssue> {
	const mode = options?.coerce ?? false;

	return new Schema({
		parse: (input): Result<boolean, SchemaIssue> => {
			const value = coerceBoolean({ input, mode });

			if (value === undefined) {
				return Err(InvalidType({ input, expected: "boolean" }));
			}

			return Ok(value);
		},
	});
}
