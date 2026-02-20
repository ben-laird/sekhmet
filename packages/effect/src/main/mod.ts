/**
 * Kitchen sink exports for the effect core module.
 * Re-exports all functionality from the mini modules.
 *
 * @module
 */

export {
	and,
	andThen,
	Async,
	cancel,
	Continuation,
	Deferred,
	Effect,
	Failure,
	Fiber,
	FiberState,
	fork,
	map,
	mapError,
	or,
	orElse,
	Ready,
	Runtime,
	Success,
} from "../mini/mod.ts";
export type {
	AsyncContinuation,
	Cancellation,
	CancellationFn,
	ContinuationVariants,
	DeferredContinuation,
	EffectFn,
	FiberParams,
	FiberStateVariants,
	RuntimeParams,
} from "../mini/mod.ts";
