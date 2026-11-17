/**
 * Invariant checks: `invariant` asserts a condition, `defined` and
 * `satisfies` return a value narrowed to what the program relies on, and
 * each panics as `Panic (Invariant)` when the program is wrong, with one
 * cause and type guard for all of them.
 *
 * @module
 */

export * from "./defined.ts";
export * from "./invariant.ts";
export * from "./satisfies.ts";
