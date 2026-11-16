/**
 * Tree-shakable primitive schema builders.
 *
 * This module provides granular exports for primitive type schemas including
 * string, number, and boolean validators with optional coercion.
 *
 * @module
 */

export { type BooleanSchemaOptions, boolean } from "./boolean.ts";
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
