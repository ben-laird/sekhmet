/**
 * Tree-shakable mini exports for the effect module.
 *
 * @module
 */

export {
	Effect,
	EffectError,
	ExceptionOccurred,
	Failed,
	Failure,
	Success,
} from "./effect.ts";
export type {
	EffectErrorVariants,
	EffectFn,
	EffectOutput,
	EffectResult,
} from "./effect.ts";
export { zip } from "../../concurrency/concurrency.ts";
export {
	and,
	andThen,
	inspect,
	inspectError,
	inspectException,
	map,
	mapError,
	mapOr,
	mapOrElse,
	or,
	orElse,
} from "./operations.ts";
export type { ResultArms } from "./operations.ts";
