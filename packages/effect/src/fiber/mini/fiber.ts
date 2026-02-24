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
import type { Runtime } from "../../runtime/runtime.ts";
import type { FiberResult } from "./fiber-error.ts";
import { Cancelled, Failed, Panicked } from "./fiber-error.ts";

const DEFAULT_STEP_BUDGET = 1024;

export type Finalizer<T, E> = (result: FiberResult<T, E>) => void;

export interface QueuedFiberState<I, T, E> {
	effect: Effect<I, T, E>;
	finalizers: Finalizer<T, E>[];
}

export interface RunningFiberState<T, E> {
	currentOutput: EffectOutput<T, E>;
	finalizers: Finalizer<T, E>[];
}

export interface SuspendedFiberState<T, E> {
	cancellation: Cancellation;
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
	const {
		config: { scheduler },
	} = getStructParams(self);

	const fiber = new Fiber<I, T, E>({
		id: crypto.randomUUID(),
		runtime: self,
		fiberState: new FiberState("Queued", { effect, finalizers: [] }),
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

	const {
		config: { scheduler, fiberConfig },
	} = getStructParams(runtime);
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

	const {
		input,
		config: { scheduler },
	} = getStructParams(runtime);

	match(fiberState)({
		Queued: ({ effect, finalizers }) => {
			// Initialize: start the effect and store the initial continuation
			try {
				const currentOutput = getStructParams(effect)(
					input,
					runtime.createContext(),
				);

				getStructParams(fiberState).variant = [
					"Running",
					{ currentOutput, finalizers },
				];
			} catch (exception: unknown) {
				complete(self, Err(Panicked(exception)));
			}
		},

		Running: ({ currentOutput, finalizers }) => {
			// Process one step: unwrap one Deferred or complete with Ready
			match(currentOutput)({
				Ready: (effectResult) => {
					match(effectResult)({
						Ok: (value) => {
							complete(self, Ok(value));
						},
						Err: (effectError) => {
							match(effectError)({
								Failed: (error) => {
									complete(self, Err(Failed(error)));
								},
								ExceptionOccurred: (exception) => {
									complete(self, Err(Panicked(exception)));
								},
							});
						},
					});
				},

				Async: (asyncFn) => {
					try {
						// Suspend the fiber and set up async callback
						const cancellation = asyncFn((continuation) => {
							match(fiberState)({
								Queued: () => {},
								Running: () => {},
								Suspended: () => {
									getStructParams(fiberState).variant = [
										"Running",
										{ currentOutput: continuation, finalizers },
									];

									scheduler.run(() => runFiber(self));
								},
								Complete: () => {},
							});
						});

						getStructParams(fiberState).variant = [
							"Suspended",
							{ cancellation, finalizers },
						];
					} catch (exception: unknown) {
						complete(self, Err(Panicked(exception)));
					}
				},

				Deferred: (fn) => {
					try {
						// Unwrap one level and store the next continuation
						getStructParams(fiberState).variant = [
							"Running",
							{ currentOutput: fn(), finalizers },
						];
					} catch (exception: unknown) {
						complete(self, Err(Panicked(exception)));
					}
				},
			});
		},

		Suspended: () => {},
		Complete: () => {},
	});
}

function complete<I, T, E>(
	self: Fiber<I, T, E>,
	result: FiberResult<T, E>,
): void {
	const { fiberState } = getStructParams(self);

	match(fiberState)({
		Queued: ({ finalizers }) => {
			runFinalizers(finalizers);

			getStructParams(fiberState).variant = ["Complete", result];
		},
		Running: ({ finalizers }) => {
			runFinalizers(finalizers);

			getStructParams(fiberState).variant = ["Complete", result];
		},
		Suspended: ({ finalizers }) => {
			runFinalizers(finalizers);

			getStructParams(fiberState).variant = ["Complete", result];
		},
		Complete: () => {},
	});

	function runFinalizers(finalizers: Finalizer<T, E>[]): void {
		try {
			for (const finalizer of finalizers) {
				finalizer(result);
			}
		} catch (err: unknown) {
			console.error({ err });
		}
	}
}

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
 * ```ts ignore
 * cancel(fiber);
 * ```
 */
export function cancel<I, T, E>(self: Fiber<I, T, E>): void {
	const { fiberState } = getStructParams(self);

	match(fiberState)({
		Queued: () => {
			complete(self, Err(Cancelled()));
		},
		Running: () => {
			complete(self, Err(Cancelled()));
		},
		Suspended: ({ cancellation }) => {
			cancellation?.();

			complete(self, Err(Cancelled()));
		},
		Complete: () => {},
	});
}
