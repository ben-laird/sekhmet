/**
 * Kitchen sink exports for the effect core module.
 * Re-exports all functionality from the mini modules.
 *
 * @module
 */

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
	getEffectFn,
	map,
	mapError,
	or,
	orElse,
	Ready,
	Runtime,
	Success,
} from "../mini/mod.ts";
