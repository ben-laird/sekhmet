import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts only symbols, failing with an `InvalidType`
 * issue otherwise.
 *
 * @returns A schema accepting only symbols
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { symbol } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(symbol(), Symbol("id"))), true);
 * assertEquals(isErr(parseSync(symbol(), "id")), true);
 * ```
 */
export function symbol(): Schema<unknown, symbol, SchemaIssue> {
	return new Schema(
		(input): Result<symbol, SchemaIssue> =>
			typeof input === "symbol"
				? Ok(input)
				: Err(InvalidType({ input, expected: "symbol" })),
	);
}
