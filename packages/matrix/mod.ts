/**
 * Builds every combination of a set of values, for parameterized tests.
 * {@linkcode matrix} takes a record of value arrays and returns their
 * Cartesian product as an array of records.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { matrix } from "@sekhmet/matrix";
 *
 * assertEquals(matrix({ a: [1, 2], b: ["x"] }), [
 *   { a: 1, b: "x" },
 *   { a: 2, b: "x" },
 * ]);
 * ```
 *
 * @module
 */

export * from "./src/mini/mod.ts";
