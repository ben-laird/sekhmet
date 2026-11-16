import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts only bigints, failing with an `InvalidType`
 * issue otherwise. It does not coerce: a number is rejected.
 *
 * @returns A schema accepting only bigints
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { bigint } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(bigint(), 10n)), true);
 * assertEquals(isErr(parseSync(bigint(), 10)), true);
 * ```
 */
export function bigint(): Schema<unknown, bigint, SchemaIssue> {
	return new Schema(
		(input): Result<bigint, SchemaIssue> =>
			typeof input === "bigint"
				? Ok(input)
				: Err(InvalidType({ input, expected: "bigint" })),
	);
}
