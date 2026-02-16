/**
 * Tree-shakable mini exports for the effect core module.
 *
 * @module
 */

export { Async, Continuation, Deferred, Ready } from "./continuation.ts";
export type {
	AsyncContinuation,
	Cancellation,
	CancellationFn,
	ContinuationVariants,
	DeferredContinuation,
} from "./continuation.ts";

export { Effect, Failure, Success } from "./effect.ts";
export type { EffectFn } from "./effect.ts";

export { and, andThen, map, mapError, or, orElse } from "./operations.ts";

export {
	cancel,
	Fiber,
	FiberState,
	fork,
	Runtime,
} from "./runtime.ts";
export type {
	FiberParams,
	FiberStateVariants,
	RuntimeParams,
} from "./runtime.ts";
