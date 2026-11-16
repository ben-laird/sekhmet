/**
 * Tree-shakable primitive schema builders.
 *
 * Leaf schemas (`string`, `number`, `boolean`, `bigint`, `date`, `literal`,
 * `null_`, `undefined_`, `symbol`, `unknown`, `never`, `stringbool`), their
 * coercion modes, and the checks and transforms that refine them.
 *
 * @module
 */

export { bigint } from "./bigint.ts";
export { type BooleanSchemaOptions, boolean } from "./boolean.ts";
export type { CoerceMode } from "./coerce.ts";
export { date } from "./date.ts";
export { type Literal, literal } from "./literal.ts";
export { never } from "./never.ts";
export { null_ } from "./null.ts";
export {
	type Bound,
	type NumberSchemaOptions,
	number,
	type Range,
} from "./number.ts";
export {
	int,
	type LimitOptions,
	max,
	min,
	multipleOf,
	safe,
} from "./number-checks.ts";
export { type StringSchemaOptions, string } from "./string.ts";
export {
	maxLength,
	minLength,
	type NormalizationForm,
	normalize,
	regex,
	trim,
} from "./string-checks.ts";
export {
	EMAIL_PATTERN,
	email,
	isoDate,
	isoDateTime,
	isoTime,
	UUID_PATTERN,
	url,
	uuid,
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
