import { Ok } from "@sekhmet/enum/result/mini";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Creates a schema that accepts every value unchanged and never fails, so
 * its error type is `never`. Use it for a field whose value is passed
 * through without validation.
 *
 * @returns A schema accepting anything
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { unknown } from "@sekhmet/schema/primitives/mini";
 *
 * const payload = { any: "thing" };
 *
 * assertEquals(unwrap(parseSync(unknown(), payload)), payload);
 * ```
 */
export function unknown(): Schema<unknown, unknown, never> {
	return new Schema({
		parse: (input) => Ok(input),
		node: new SchemaNode("Leaf", { type: "unknown" }),
	});
}
