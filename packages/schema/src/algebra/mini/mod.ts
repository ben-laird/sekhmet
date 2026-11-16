/**
 * Tree-shakable schema algebra: combine schemas and reshape object shapes.
 * `or({ left, right })` is a union of two schemas that flattens when
 * chained.
 *
 * @module
 */

export { type OrOptions, or } from "./or.ts";
