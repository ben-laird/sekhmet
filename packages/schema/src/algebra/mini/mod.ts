/**
 * Tree-shakable schema algebra: combine schemas and reshape object shapes.
 * `or({ left, right })` is a union of two schemas that flattens when
 * chained; `brand(self, name)` brands a schema's output type.
 *
 * @module
 */

export { BRAND, type Branded, brand } from "./brand.ts";
export { type OrOptions, or } from "./or.ts";
