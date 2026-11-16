/**
 * Fiber state machine and lifecycle functions.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import type { Cancellation } from "../../continuation/continuation.ts";
import type { Effect, EffectOutput } from "../../effect/mini/effect.ts";
import type { Runtime } from "../../runtime/runtime.ts";
import type { FiberResult } from "./fiber-error.ts";
import { Cancelled } from "./fiber-error.ts";

/**
 * Callback invoked when a fiber completes, receiving its final result.
 *
 * @template T - Success value type
 * @template E - Error type
 */
export type Finalizer<T, E> = (result: FiberResult<T, E>) => void;

/**
 * State of a fiber that is waiting to begin execution.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export interface QueuedFiberState<I, T, E> {
	/** The effect this fiber will run. */
	effect: Effect<I, T, E>;
	/** Callbacks to invoke when the fiber completes. */
	finalizers: Finalizer<T, E>[];
}

/**
 * State of a fiber that is actively executing.
 *
 * @template T - Success value type
 * @template E - Error type
 */
export interface RunningFiberState<T, E> {
	/** The current continuation being processed. */
	currentOutput: EffectOutput<T, E>;
	/** Callbacks to invoke when the fiber completes. */
	finalizers: Finalizer<T, E>[];
}

/**
 * State of a fiber that is suspended, waiting for an async operation.
 *
 * @template T - Success value type
 * @template E - Error type
 */
export interface SuspendedFiberState<T, E> {
	/** Function to cancel the pending async operation. */
	cancellation: Cancellation;
	/** Callbacks to invoke when the fiber completes. */
	finalizers: Finalizer<T, E>[];
}

/**
 * Variants representing the state of a fiber's execution.
 *
 * - Queued: Fiber is waiting to start
 * - Running: Fiber is actively executing with the current continuation
 * - Suspended: Fiber is waiting for async work with optional cancellation
 * - Complete: Fiber finished with a result
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export type FiberStateVariants<I, T, E> = Split<{
	Queued: [state: QueuedFiberState<I, T, E>];
	Running: [state: RunningFiberState<T, E>];
	Suspended: [state: SuspendedFiberState<T, E>];
	Complete: [result: FiberResult<T, E>];
}>;

/**
 * Represents the execution state of a fiber.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export class FiberState<I, T, E> extends Enum<FiberStateVariants<I, T, E>> {}

/**
 * Parameters for the Fiber struct.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export interface FiberParams<I, T, E> {
	/**
	 * Unique identifier for this fiber.
	 */
	id: string;

	/**
	 * Current execution state of the fiber.
	 */
	fiberState: FiberState<I, T, E>;

	/**
	 * The runtime environment this fiber executes within.
	 */
	runtime: Runtime<I>;
}

/**
 * A Fiber represents a running instance of an effect.
 * It tracks the execution state and can be cancelled or queried for results.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export class Fiber<I, T, E> extends Struct<FiberParams<I, T, E>> {}

/**
 * Registers a finalizer callback to be invoked when the fiber completes.
 * If the fiber has already completed, the callback is invoked immediately.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The fiber to observe
 * @param finalizer - Callback to invoke with the fiber's result
 */
export function join<I, T, E>(
	self: Fiber<I, T, E>,
	finalizer: Finalizer<T, E>,
): void {
	const { fiberState } = getStructParams(self);

	match(fiberState)({
		Queued: ({ finalizers }) => {
			finalizers.push(finalizer);
		},
		Running: ({ finalizers }) => {
			finalizers.push(finalizer);
		},
		Suspended: ({ finalizers }) => {
			finalizers.push(finalizer);
		},
		Complete: (result) => {
			finalizer(result);
		},
	});
}

/**
 * Cancels a running fiber, stopping its execution and calling any cleanup functions.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The fiber to cancel
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Async } from "@sekhmet/effect/continuation";
 * import { Effect } from "@sekhmet/effect/effect/mini";
 * import { Cancelled, cancel, fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Err } from "@sekhmet/enum/result/mini";
 *
 * let cleanedUp = false;
 * // Suspends on async work that never resolves on its own
 * const forever = new Effect<void, number, never>(() =>
 *   Async(() => () => {
 *     cleanedUp = true;
 *   })
 * );
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const fiber = fork(runtime, forever);
 * const results: unknown[] = [];
 * join(fiber, (result) => results.push(result));
 *
 * cancel(fiber);
 *
 * assertEquals(cleanedUp, true);
 * assertEquals(results, [Err(Cancelled())]);
 * ```
 */
export function cancel<I, T, E>(self: Fiber<I, T, E>): void {
	const { fiberState } = getStructParams(self);
	const result: FiberResult<T, E> = Err(Cancelled<E>());

	// Mark Complete before any callback runs, so re-entrant cancels are no-ops.
	match(fiberState)({
		Queued: ({ finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];
			runFinalizers(finalizers, result);
		},
		Running: ({ finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];
			runFinalizers(finalizers, result);
		},
		Suspended: ({ cancellation, finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];
			try {
				cancellation?.();
			} catch (err: unknown) {
				// Joiners must still learn of the cancellation; report the cleanup failure.
				console.error("Fiber cancellation cleanup threw:", err);
			}
			runFinalizers(finalizers, result);
		},
		Complete: () => {},
	});
}

/**
 * Runs every finalizer, isolating each one: a throw is logged and the rest
 * still run. Logging, not rethrowing, keeps a faulty joiner from escaping
 * into the scheduler or the caller of cancel.
 */
function runFinalizers<T, E>(
	finalizers: Finalizer<T, E>[],
	result: FiberResult<T, E>,
): void {
	for (const finalizer of finalizers) {
		try {
			finalizer(result);
		} catch (err: unknown) {
			console.error("Fiber finalizer threw:", err);
		}
	}
}
