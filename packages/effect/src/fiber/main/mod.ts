/**
 * Full-featured kitchen-sink exports for the fiber module.
 *
 * This module provides a fluent, method-based API for working with fibers.
 * It extends the mini {@linkcode mini.Fiber} class and wraps each operation
 * from `fiber/mini` that takes a `self: Fiber` first argument as an instance
 * method, using the memento pattern to convert results back into main `Fiber`
 * instances where applicable.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import { Effect } from "../../effect/main/mod.ts";
import * as mini from "../mini/mod.ts";

export type {
	FiberErrorVariants,
	FiberResult,
	Finalizer,
} from "../mini/mod.ts";
export { FiberError, fork } from "../mini/mod.ts";

/**
 * Full-featured Fiber class providing a fluent, method-based API.
 *
 * This is the "kitchen sink" version of the Fiber class that wraps the
 * functional mini exports as instance methods. Each method delegates to its
 * corresponding mini function.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 *
 * @see {@link mini.join} for the functional API
 * @see {@link mini.cancel} for cancellation
 */
export class Fiber<I, T, E> extends mini.Fiber<I, T, E> {
	/**
	 * Registers a finalizer callback to be invoked when this fiber completes.
	 * If the fiber has already completed, the callback is invoked immediately.
	 *
	 * @param finalizer - Callback to invoke with the fiber's result
	 * @see {@link mini.join}
	 */
	join(finalizer: mini.Finalizer<T, E>): void {
		mini.join(this, finalizer);
	}

	/**
	 * Returns an effect that completes when this fiber completes, propagating
	 * the fiber's result as the effect's result.
	 *
	 * @returns An effect that resolves with the fiber's result
	 * @see {@link mini.joinEffect}
	 */
	joinEffect(): Effect<void, T, mini.FiberError<E>> {
		return new Effect(getStructParams(mini.joinEffect(this)));
	}

	/**
	 * Cancels this fiber, stopping its execution and invoking any registered
	 * finalizers with a `Cancelled` error.
	 *
	 * @see {@link mini.cancel}
	 */
	cancel(): void {
		mini.cancel(this);
	}
}
