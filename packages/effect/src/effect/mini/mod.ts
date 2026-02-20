/**
 * Tree-shakable mini exports for the effect module.
 *
 * @module
 */

export { Effect, Failure, Success } from "./effect.ts";
export type { EffectFn } from "./effect.ts";

export { and, andThen, map, mapError, or, orElse } from "./operations.ts";
