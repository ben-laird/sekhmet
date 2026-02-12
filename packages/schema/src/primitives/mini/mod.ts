/**
 * Tree-shakable primitive schema builders.
 *
 * This module provides granular exports for primitive type schemas including
 * string, number, and boolean validators with optional coercion.
 *
 * @module
 */

export { boolean, type BooleanSchemaOptions } from "./boolean.ts";
export { number, type Bound, type NumberSchemaOptions, type Range } from "./number.ts";
export { string, type StringSchemaOptions } from "./string.ts";
