/**
 * Tree-shakable mini exports for the effect core module.
 *
 * @module
 */

export type {
	AsyncContinuation,
	Cancellation,
	CancellationFn,
	ContinuationVariants,
	DeferredContinuation,
} from "./continuation.ts";
export { Async, Continuation, Deferred, Ready } from "./continuation.ts";

export type { EffectFn } from "./effect.ts";
export { Effect, Failure, getEffectFn, Success } from "./effect.ts";

export { and, andThen, map, mapError, or, orElse } from "./operations.ts";

export type {
	FiberParams,
	FiberStateVariants,
	RuntimeParams,
} from "./runtime.ts";
export {
	cancel,
	Fiber,
	FiberState,
	fork,
	Runtime,
} from "./runtime.ts";
