/**
 * The undefined primitive: {@linkcode undefined_} builds a schema that
 * accepts only `undefined`.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
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
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * assertEquals(isOk(parseSync(undefined_(), { input: undefined, panics })), true);
 * assertEquals(isErr(parseSync(undefined_(), { input: null, panics })), true);
 * ```
 */
export function undefined_(): Schema<unknown, undefined, SchemaIssue> {
	return new Schema({
		parse: (input): Result<undefined, SchemaIssue> => {
			if (input === undefined) return Ok(input);

			return Err(InvalidType({ input, expected: "undefined" }));
		},
		node: new SchemaNode("Leaf", { type: "undefined" }),
	});
}
