/**
 * Continuation types for representing computation steps.
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
