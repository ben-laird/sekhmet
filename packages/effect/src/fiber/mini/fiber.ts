/**
 * Fiber execution state machine and lifecycle functions.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import type { Cancellation } from "../../continuation/continuation.ts";
import type { Effect, EffectOutput } from "../../effect/mini/effect.ts";
import { Cancelled, Failed, Panicked } from "./fiber-error.ts";
import type { FiberError, FiberResult } from "./fiber-error.ts";
import type { Runtime } from "../../runtime/runtime.ts";

const DEFAULT_STEP_BUDGET = 1024;

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
	Queued: [effect: Effect<I, T, E>];
	Running: [currentOutput: EffectOutput<T, E>];
	Suspended: [cancellation: Cancellation];
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
 * Forks an effect into a new fiber and begins execution.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The runtime to execute within
 * @param effect - The effect to execute
 * @returns A new fiber running the effect
 *
 * @example
 * ```ts ignore
 * const runtime = new Runtime({ input: undefined });
 * const fiber = fork(runtime, myEffect);
 * ```
 */
export function fork<I, T, E>(
	self: Runtime<I>,
	effect: Effect<I, T, E>,
): Fiber<I, T, E> {
	const { config: { scheduler } } = getStructParams(self);

	const fiber = new Fiber<I, T, E>({
		id: crypto.randomUUID(),
		runtime: self,
		fiberState: new FiberState("Queued", effect),
	});

	scheduler.run(() => runFiber(fiber));

	return fiber;
}

/**
 * Runs a fiber until it suspends, cancels, or completes.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The fiber to run
 */
function runFiber<I, T, E>(self: Fiber<I, T, E>): void {
	const { fiberState, runtime } = getStructParams(self);

	const { config: { scheduler, fiberConfig } } = getStructParams(runtime);
	const stepBudget = fiberConfig?.stepBudget ?? DEFAULT_STEP_BUDGET;

	let remainingBudget = stepBudget;

	while (remainingBudget > 0) {
		remainingBudget--;

		step(self, `step: budget - ${remainingBudget}`);

		const shouldContinue = match(fiberState)({
			Queued: () => true,
			Running: () => true,
			Suspended: () => false,
			Complete: () => false,
		});

		if (!shouldContinue) {
			return;
		}
	}

	// Budget exhausted but fiber still running - reschedule
	scheduler.run(() => runFiber(self));
}

/**
 * Executes one step of fiber execution, processing the current continuation.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The fiber to step
 * @param label - Debug label for this step
 */
function step<I, T, E>(self: Fiber<I, T, E>, label = "step"): void {
	const { runtime, fiberState, id: fiberId } = getStructParams(self);

	console.log({ fiberId, label, variant: getStructParams(fiberState).variant });

	const { input, config: { scheduler } } = getStructParams(runtime);

	match(fiberState)({
		Queued: (effect) => {
			// Initialize: start the effect and store the initial continuation
			try {
				getStructParams(fiberState).variant = [
					"Running",
					getStructParams(effect)(input),
				];
			} catch (exception: unknown) {
				getStructParams(fiberState).variant = [
					"Complete",
					Err<T, FiberError<E>>(Panicked(exception)),
				];
			}
		},

		Running: (currentContinuation) => {
			// Process one step: unwrap one Deferred or complete with Ready
			match(currentContinuation)({
				Ready: (effectResult) => {
					match(effectResult)({
						Ok: (value) => {
							getStructParams(fiberState).variant = [
								"Complete",
								Ok<T, FiberError<E>>(value),
							];
						},
						Err: (effectError) => {
							match(effectError)({
								Failed: (error) => {
									getStructParams(fiberState).variant = [
										"Complete",
										Err<T, FiberError<E>>(Failed(error)),
									];
								},
								ExceptionOccurred: (exception) => {
									getStructParams(fiberState).variant = [
										"Complete",
										Err<T, FiberError<E>>(Panicked(exception)),
									];
								},
							});
						},
					});
				},

				Async: (asyncFn) => {
					try {
						// Suspend the fiber and set up async callback
						getStructParams(fiberState).variant = [
							"Suspended",
							asyncFn((continuation) => {
								match(fiberState)({
									Queued: () => {},
									Running: () => {},
									Suspended: () => {
										getStructParams(fiberState).variant = [
											"Running",
											continuation,
										];

										scheduler.run(() => runFiber(self));
									},
									Complete: () => {},
								});
							}),
						];
					} catch (exception: unknown) {
						getStructParams(fiberState).variant = [
							"Complete",
							Err<T, FiberError<E>>(Panicked(exception)),
						];
					}
				},

				Deferred: (fn) => {
					try {
						// Unwrap one level and store the next continuation
						getStructParams(fiberState).variant = ["Running", fn()];
					} catch (exception: unknown) {
						getStructParams(fiberState).variant = [
							"Complete",
							Err<T, FiberError<E>>(Panicked(exception)),
						];
					}
				},
			});
		},

		Suspended: () => {},
		Complete: () => {},
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
 * ```ts ignore
 * cancel(fiber);
 * ```
 */
export function cancel<I, T, E>(self: Fiber<I, T, E>): void {
	const { fiberState } = getStructParams(self);

	match(fiberState)({
		Queued: () => {
			getStructParams(fiberState).variant = [
				"Complete",
				Err<T, FiberError<E>>(Cancelled()),
			];
		},
		Running: () => {
			getStructParams(fiberState).variant = [
				"Complete",
				Err<T, FiberError<E>>(Cancelled()),
			];
		},
		Suspended: (cancellation) => {
			getStructParams(fiberState).variant = [
				"Complete",
				Err<T, FiberError<E>>(Cancelled()),
			];
			cancellation?.();
		},
		Complete: () => {},
	});
}
