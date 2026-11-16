/**
 * Tree-shakable composite schemas: declarative schemas built from other
 * schemas (`object`, `array`, `tuple`, `record`, `union`,
 * `discriminatedUnion`, `enumOf`, `optional`, `nullable`, `lazy`). Each
 * reports every failing part, located by its path, as `Issues`. Options are
 * declarative: `object({ shape, unknownKeys: "strict" })`,
 * `array({ item, minItems: 1 })`.
 *
 * @module
 */

export { type ArrayInput, type ArrayOptions, array } from "./array.ts";
export {
	type DiscriminatedInput,
	type DiscriminatedOutput,
	type DiscriminatedUnionOptions,
	discriminatedUnion,
	type Options,
} from "./discriminated-union.ts";
export { enumOf } from "./enum-of.ts";
export { lazy, nullable, optional } from "./modifiers.ts";
export {
	type Field,
	type FieldSchema,
	type KeyPresence,
	type ObjectError,
	type ObjectInput,
	type ObjectOptions,
	type ObjectOutput,
	object,
	type Shape,
	type UnknownKeys,
	type WithOptionalKeys,
} from "./object.ts";
export {
	type RecordInput,
	type RecordOptions,
	type RecordOutput,
	record,
} from "./record.ts";
export {
	type TupleError,
	type TupleInput,
	type TupleOutput,
	tuple,
} from "./tuple.ts";
export { type UnionInput, union } from "./union.ts";
