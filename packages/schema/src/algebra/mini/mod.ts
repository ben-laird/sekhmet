/**
 * Tree-shakable schema algebra: combine schemas and reshape object shapes.
 * `or({ left, right })` is a union of two schemas that flattens when
 * chained; `brand(self, name)` brands a schema's output type; and
 * `readonly(self)` freezes a copy of its output. The reshapers `pick`,
 * `omit`, `partial` and `required` build an `object` shape from another.
 *
 * @module
 */

export { BRAND, type Branded, brand } from "./brand.ts";
export { type OrOptions, or } from "./or.ts";
export { type ReadonlyOutput, readonly } from "./readonly.ts";
export {
	type OmitOptions,
	omit,
	type PartialShape,
	type PickOptions,
	partial,
	pick,
	type RequiredShape,
	required,
} from "./shape.ts";
