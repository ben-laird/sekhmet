/**
 * How primitive schemas coerce a value of another type:
 * {@linkcode CoerceMode}, the type of their `coerce` option.
 *
 * @module
 */

/**
 * How a primitive schema treats a value of another type:
 *
 * - `false` (the default): reject it.
 * - `true`: **strict, lossless** coercion. Convert only a value that
 *   unambiguously means one of the schema's values; reject the rest.
 * - `"native"`: JavaScript's own `Number()`, `String()` or `Boolean()`,
 *   traps included (`Number("")` is `0`, `Boolean("false")` is `true`). The
 *   result is still checked, so `number({ coerce: "native" })` still rejects
 *   the `NaN` that `Number("abc")` gives, unless `nan: true`.
 *
 * A value that does not convert fails with an `InvalidType` issue carrying
 * the original input; a converted value that then fails a check (such as
 * `NaN`) is reported as the converted value. What strict mode accepts
 * besides the schema's own type:
 *
 * | Schema    | `coerce: true` also accepts                                                       | Still rejects (examples)                        |
 * | --------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
 * | `number`  | decimal or exponent strings (trimmed), booleans as 1/0, safe-integer bigints      | `""`, `"0x10"`, `null`, `undefined`, `[]`, `{}` |
 * | `string`  | finite numbers, bigints, booleans                                                 | `null`, `undefined`, `NaN`, objects, symbols    |
 * | `boolean` | `0`/`1`, `0n`/`1n`, and `stringbool`'s default words                              | `"maybe"`, `2`, `null`, objects                 |
 *
 * `bigint` and `date` do not coerce. To read a boolean from a string, prefer
 * `stringbool()`, which accepts only strings.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { type CoerceMode, number } from "@sekhmet/schema/primitives/mini";
 *
 * const strict: CoerceMode = true;
 * const native: CoerceMode = "native";
 *
 * assertEquals(isErr(parseSync(number({ coerce: strict }), "")), true);
 * assertEquals(unwrap(parseSync(number({ coerce: native }), "")), 0);
 * ```
 */
export type CoerceMode = boolean | "native";
