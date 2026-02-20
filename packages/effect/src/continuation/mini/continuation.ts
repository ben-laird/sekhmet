/**
 * Continuation types for representing computation steps.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";

/**
 * Function that handles asynchronous continuation resolution.
 * Receives a resolve callback to continue execution with a new continuation.
 * Optionally returns a cancellation function to clean up resources.
 *
 * @template T - The continuation value type
 */
export type AsyncContinuation<T> = (
	resolve: (continuation: Continuation<T>) => void,
) => Cancellation;

/**
 * Represents an optional cancellation callback.
 * When defined, this function is called to clean up resources when a fiber is cancelled.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: necessary for types to work properly
export type Cancellation = void | CancellationFn;

/**
 * Function that performs cancellation cleanup.
 */
export type CancellationFn = () => void;

/**
 * Function that defers computation until explicitly evaluated.
 *
 * @template T - The continuation value type
 */
export type DeferredContinuation<T> = () => Continuation<T>;

/**
 * Variants representing different continuation states.
 *
 * - Ready: Computation is complete with a value
 * - Async: Computation requires asynchronous work
 * - Deferred: Computation is deferred and needs one more step
 *
 * @template T - The continuation value type
 */
export type ContinuationVariants<T> = Split<{
	Ready: [value: T];
	Async: [fn: AsyncContinuation<T>];
	Deferred: [fn: DeferredContinuation<T>];
}>;

/**
 * Represents a step in an effect computation.
 * Can be Ready (complete), Async (awaiting), or Deferred (needs unwrapping).
 *
 * @template T - The value type the continuation eventually produces
 */
export class Continuation<T> extends Enum<ContinuationVariants<T>> {}

/**
 * Creates a Ready continuation with an immediate value.
 *
 * @template T - The value type
 * @param value - The immediate value
 * @returns A Ready continuation
 *
 * @example
 * ```ts ignore
 * const cont = Ready(Ok(42));
 * ```
 */
export function Ready<T>(value: T): Continuation<T> {
	return new Continuation<T>("Ready", value);
}

/**
 * Creates an Async continuation that requires asynchronous work.
 *
 * @template T - The value type
 * @param fn - Function that sets up async work and returns optional cleanup
 * @returns An Async continuation
 *
 * @example
 * ```ts ignore
 * const cont = Async((resolve) => {
 *   const timer = setTimeout(() => resolve(Ready(Ok("done"))), 100);
 *   return () => clearTimeout(timer);
 * });
 * ```
 */
export function Async<T>(fn: AsyncContinuation<T>): Continuation<T> {
	return new Continuation<T>("Async", fn);
}

/**
 * Creates a Deferred continuation that delays one computation step.
 *
 * @template T - The value type
 * @param fn - Function that returns the next continuation when called
 * @returns A Deferred continuation
 *
 * @example
 * ```ts ignore
 * const cont = Deferred(() => Ready(Ok(42)));
 * ```
 */
export function Deferred<T>(fn: DeferredContinuation<T>): Continuation<T> {
	return new Continuation<T>("Deferred", fn);
}
