/**
 * Enums of literals: {@linkcode enumOf} builds a schema that accepts exactly
 * the given literal values, typed as their union.
 *
 * @module
 */

import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidValue, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type { Literal } from "@/src/primitives/mini/literal.ts";

/**
 * A guard for one of `values` (SameValueZero, so `NaN` matches). Curried, so
 * each call takes one parameter and the guard narrows `input`.
 */
function oneOf<T extends Literal>(
	values: readonly T[],
): (input: unknown) => input is T {
	const allowed: readonly unknown[] = values;

	return (input): input is T => allowed.includes(input);
}

/**
 * Creates a schema that accepts exactly the given values: an enum of
 * literals, typed as their union. Anything else fails with an
 * `InvalidValue` issue listing them.
 *
 * Named `enumOf` because `enum` is a reserved word; it lists values, where
 * `union` lists schemas.
 *
 * @template T The allowed values
 * @param values The allowed values (at least one)
 * @returns A schema for one of `values`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { unwrapErr } from "@sekhmet/panic/outcome/mini";
 * import { enumOf } from "@sekhmet/schema/composites/mini";
 * import { formatIssue, parse, parseSync } from "@sekhmet/schema/core/mini";
 * import { wait } from "@sekhmet/vow";
 *
 * const color = enumOf(["red", "green"]);
 *
 * assertEquals(unwrap(parseSync(color, "red")), "red");
 * assertEquals(
 * 	formatIssue(
 * 		unwrapErr(await wait(parse(color, { input: "blue", panics: definePanicRuntime() }))),
 * 	),
 * 	'Expected one of "red", "green"',
 * );
 * ```
 */
export function enumOf<const T extends readonly [Literal, ...Literal[]]>(
	values: T,
): Schema<unknown, T[number], SchemaIssue> {
	const isAllowed = oneOf<T[number]>(values);

	return new Schema({
		parse: (input: unknown) => {
			if (isAllowed(input)) return Ok(input);

			return Err(InvalidValue({ input, expected: values }));
		},
		node: new SchemaNode("Leaf", { type: "enum", values }),
	});
}
