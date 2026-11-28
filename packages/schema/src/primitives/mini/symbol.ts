/**
 * The symbol primitive: {@linkcode symbol} builds a schema that accepts only
 * symbols.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
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
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * assertEquals(isOk(parseSync(symbol(), { input: Symbol("id"), panics })), true);
 * assertEquals(isErr(parseSync(symbol(), { input: "id", panics })), true);
 * ```
 */
export function symbol(): Schema<unknown, symbol, SchemaIssue> {
	return new Schema({
		parse: (input): Result<symbol, SchemaIssue> => {
			if (typeof input === "symbol") return Ok(input);

			return Err(InvalidType({ input, expected: "symbol" }));
		},
		node: new SchemaNode("Leaf", { type: "symbol" }),
	});
}
