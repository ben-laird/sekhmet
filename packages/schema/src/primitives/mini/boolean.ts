/**
 * The boolean primitive: {@linkcode boolean} builds a schema that accepts
 * booleans, optionally coercing other values as its
 * {@linkcode BooleanSchemaOptions} say.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
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
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * assertEquals(unwrap(parseSync(boolean(), { input: true, panics })), true);
 * assertEquals(isErr(parseSync(boolean(), { input: "true", panics })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { boolean } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const strict = boolean({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, { input: "false", panics })), false);
 * assertEquals(unwrap(parseSync(strict, { input: 1, panics })), true);
 * assertEquals(isErr(parseSync(strict, { input: "maybe", panics })), true);
 *
 * const native = boolean({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, { input: "false", panics })), true);
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
		node: new SchemaNode("Leaf", { type: "boolean", options: options ?? {} }),
	});
}
