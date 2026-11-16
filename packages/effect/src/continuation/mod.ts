/**
 * Continuation types for representing computation steps.
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
