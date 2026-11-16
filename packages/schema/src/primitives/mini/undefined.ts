import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts only `undefined`, failing with an
 * `InvalidType` issue otherwise (`null` included).
 *
 * Named `undefined_` to match {@linkcode null_} and to avoid shadowing the
 * global `undefined`.
 *
 * @returns A schema accepting only `undefined`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { undefined_ } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(undefined_(), undefined)), true);
 * assertEquals(isErr(parseSync(undefined_(), null)), true);
 * ```
 */
export function undefined_(): Schema<unknown, undefined, SchemaIssue> {
	return new Schema(
		(input): Result<undefined, SchemaIssue> =>
			input === undefined
				? Ok(input)
				: Err(InvalidType({ input, expected: "undefined" })),
	);
}
