/**
 * Top-level re-export for @sekhmet/effect package.
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
} from "./src/main/mod.ts";
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
} from "./src/main/mod.ts";
