/**
 * Literal schemas: {@linkcode literal} builds a schema that accepts exactly
 * one primitive value, of type {@linkcode Literal}.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { InvalidValue, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/** A value a {@linkcode literal} schema can match: any primitive. */
export type Literal =
	| string
	| number
	| bigint
	| boolean
	| symbol
	| null
	| undefined;

/**
 * A guard for `value` under SameValueZero, the equality of
 * `Array.prototype.includes`: `NaN` matches `NaN`, and `0` matches `-0`.
 * Curried, so each call takes one parameter and the guard narrows `input`.
 */
function sameAs<T extends Literal>(value: T): (input: unknown) => input is T {
	const allowed: readonly unknown[] = [value];

	return (input): input is T => allowed.includes(input);
}

/**
 * Creates a schema that accepts exactly one primitive value, failing with an
 * `InvalidValue` issue otherwise. Values compare with SameValueZero (as
 * `Array.prototype.includes` does), so `literal(Number.NaN)` accepts `NaN`
 * and `literal(0)` accepts `-0`. The output type is the literal's own type.
 *
 * @template T The literal's type, inferred as narrowly as possible
 * @param value The only accepted value
 * @returns A schema accepting only `value`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { literal } from "@sekhmet/schema/primitives/mini";
 *
 * const admin = literal("admin");
 * const role: "admin" = unwrap(parseSync(admin, "admin"));
 *
 * assertEquals(role, "admin");
 * assertEquals(isErr(parseSync(admin, "user")), true);
 * ```
 */
export function literal<const T extends Literal>(
	value: T,
): Schema<unknown, T, SchemaIssue> {
	const isValue = sameAs(value);

	return new Schema({
		parse: (input): Result<T, SchemaIssue> => {
			if (isValue(input)) return Ok(input);

			return Err(InvalidValue({ input, expected: [value] }));
		},
		node: new SchemaNode("Leaf", { type: "literal", value }),
	});
}
