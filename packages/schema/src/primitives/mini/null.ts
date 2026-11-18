import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts only `null`, failing with an `InvalidType`
 * issue otherwise (`undefined` included).
 *
 * Named `null_` because `null` is a reserved word; the trailing underscore
 * is the usual escape for a keyword.
 *
 * @returns A schema accepting only `null`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { null_ } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(null_(), null)), true);
 * assertEquals(isErr(parseSync(null_(), undefined)), true);
 * ```
 */
export function null_(): Schema<unknown, null, SchemaIssue> {
	return new Schema({
		parse: (input): Result<null, SchemaIssue> => {
			if (input === null) return Ok(input);

			return Err(InvalidType({ input, expected: "null" }));
		},
		node: new SchemaNode("Leaf", { type: "null" }),
	});
}
