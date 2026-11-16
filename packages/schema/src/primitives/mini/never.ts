import { Err } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that rejects every value with an `InvalidType` issue
 * expecting `"never"`, so its output type is `never`. Use it to forbid a
 * field, or as the schema of a case that cannot occur.
 *
 * @returns A schema accepting nothing
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { never } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isErr(parseSync(never(), undefined)), true);
 * ```
 */
export function never(): Schema<unknown, never, SchemaIssue> {
	return new Schema({
		parse: (input) => Err(InvalidType({ input, expected: "never" })),
		node: new SchemaNode("Leaf", { type: "never" }),
	});
}
