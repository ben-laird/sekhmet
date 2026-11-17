/**
 * Tree-shakable primitive schema builders.
 *
 * Leaf schemas (`string`, `number`, `boolean`, `bigint`, `date`, `literal`,
 * `null_`, `undefined_`, `symbol`, `unknown`, `never`, `stringbool`). Their
 * coercion, transforms and checks are options: `number({ int: true, min: 0 })`,
 * `string({ trim: true, format: "email" })`.
 *
 * @module
 */

export { type BigintSchemaOptions, bigint } from "./bigint.ts";
export { type BooleanSchemaOptions, boolean } from "./boolean.ts";
export type { Bound } from "./bound.ts";
export type { CoerceMode } from "./coerce.ts";
export { type DateSchemaOptions, date } from "./date.ts";
export { type Literal, literal } from "./literal.ts";
export { never } from "./never.ts";
export { null_ } from "./null.ts";
export { type NumberSchemaOptions, number } from "./number.ts";
export { type StringSchemaOptions, string } from "./string.ts";
export type { LetterCase, NormalizationForm } from "./string-checks.ts";
export {
	EMAIL_PATTERN,
	type FractionalDigits,
	type OffsetRule,
	type StringFormat,
	type TimeFormat,
	UUID_PATTERN,
} from "./string-formats.ts";
export {
	STRINGBOOL_FALSY,
	STRINGBOOL_TRUTHY,
	type StringboolOptions,
	stringbool,
} from "./stringbool.ts";
export { symbol } from "./symbol.ts";
export { undefined_ } from "./undefined.ts";
export { unknown } from "./unknown.ts";
