/**
 * Booleans read from strings: {@linkcode stringbool} builds a schema that
 * reads words such as `"yes"` and `"off"` as booleans, for env vars, query
 * params and form fields, with its {@linkcode StringboolOptions} and the
 * default word lists `STRINGBOOL_TRUTHY` and `STRINGBOOL_FALSY`.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import {
	InvalidType,
	InvalidValue,
	type SchemaIssue,
} from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import { STRINGBOOL_FALSY, STRINGBOOL_TRUTHY, wordReader } from "./words.ts";

export { STRINGBOOL_FALSY, STRINGBOOL_TRUTHY } from "./words.ts";

/**
 * Options for {@linkcode stringbool}: the words read as each boolean. Words
 * match after trimming, ignoring case.
 */
export interface StringboolOptions {
	/**
	 * The words read as `true`.
	 *
	 * @default STRINGBOOL_TRUTHY
	 */
	truthy?: readonly string[];

	/**
	 * The words read as `false`.
	 *
	 * @default STRINGBOOL_FALSY
	 */
	falsy?: readonly string[];
}

/**
 * Creates a schema that reads a string as a boolean, for env vars, query
 * params and form fields. The string is trimmed and matched ignoring case
 * against the truthy and falsy word lists (`STRINGBOOL_TRUTHY` and
 * `STRINGBOOL_FALSY` by default: `true 1 yes on y enabled` and
 * `false 0 no off n disabled`).
 *
 * A non-string fails with an `InvalidType` issue, and a string in neither
 * list with an `InvalidValue` issue listing the accepted words. Panics with a
 * `RangeError` when a word is in both lists.
 *
 * @param options The word lists
 * @returns A schema from a string to a boolean
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { stringbool } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const flag = stringbool();
 *
 * assertEquals(unwrap(parseSync(flag, { input: " Yes ", panics })), true);
 * assertEquals(unwrap(parseSync(flag, { input: "OFF", panics })), false);
 * assertEquals(isErr(parseSync(flag, { input: "maybe", panics })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { stringbool } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const answer = stringbool({ truthy: ["oui"], falsy: ["non"] });
 *
 * assertEquals(unwrap(parseSync(answer, { input: "Oui", panics })), true);
 * ```
 */
export function stringbool(
	options?: StringboolOptions,
): Schema<unknown, boolean, SchemaIssue> {
	const read = wordReader(options);
	const expected = [
		...(options?.truthy ?? STRINGBOOL_TRUTHY),
		...(options?.falsy ?? STRINGBOOL_FALSY),
	];

	return new Schema({
		parse: (input): Result<boolean, SchemaIssue> => {
			if (typeof input !== "string") {
				return Err(InvalidType({ input, expected: "string" }));
			}

			const value = read(input);

			if (value === undefined) return Err(InvalidValue({ input, expected }));

			return Ok(value);
		},
		node: new SchemaNode("Leaf", {
			type: "stringbool",
			options: options ?? {},
		}),
	});
}
