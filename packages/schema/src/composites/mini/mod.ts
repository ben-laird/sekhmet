/**
 * Tree-shakable composite schemas: declarative schemas built from other
 * schemas (`object`, `array`, `tuple`, `record`, `union`,
 * `discriminatedUnion`, `enumOf`, `optional`, `nullable`, `lazy`). Each
 * reports every failing part, located by its path, as `Issues`.
 *
 * @module
 */

export { type ArrayInput, array, maxItems, minItems } from "./array.ts";
export {
	type DiscriminatedInput,
	type DiscriminatedOutput,
	discriminatedUnion,
	type Options,
} from "./discriminated-union.ts";
export { enumOf, type Literal } from "./enum-of.ts";
export { lazy, nullable, optional } from "./modifiers.ts";
export {
	type ObjectError,
	type ObjectInput,
	type ObjectOutput,
	type ObjectParser,
	ObjectSchema,
	object,
	passthrough,
	type Shape,
	strict,
	strip,
	type UnknownKeys,
	type WithOptionalKeys,
} from "./object.ts";
export { type RecordInput, type RecordOutput, record } from "./record.ts";
export {
	type TupleError,
	type TupleInput,
	type TupleOutput,
	tuple,
} from "./tuple.ts";
export { type UnionInput, union } from "./union.ts";
