/**
 * Fiber execution: {@linkcode fork} starts an effect on a new fiber within a
 * {@linkcode Runtime}, and the fiber is driven step by step on the runtime's
 * scheduler. Import `fork` from `@sekhmet/effect/fiber` (main) or
 * `@sekhmet/effect/fiber/mini`; this entrypoint holds the mini `fork` alone.
 *
 * @module
 */

import { match, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { Cancellation } from "../continuation/continuation.ts";
import type { Effect, EffectOutput } from "../effect/mini/effect.ts";
import { Fiber, FiberState, type Finalizer } from "../fiber/mini/fiber.ts";
import {
	Failed,
	type FiberResult,
	Panicked,
} from "../fiber/mini/fiber-error.ts";
import type { Runtime } from "../runtime/runtime.ts";

const DEFAULT_STEP_BUDGET = 1024;

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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const fiber = fork(runtime, Success(42));
 *
 * const results: unknown[] = [];
 * join(fiber, (result) => results.push(result));
 * assertEquals(results, [Ok(42)]);
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

		step(self);

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
 */
function step<I, T, E>(self: Fiber<I, T, E>): void {
	const { runtime, fiberState } = getStructParams(self);

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

				// The effect may have cancelled this fiber; never overwrite Complete.
				if (unionKinds(fiberState) === "Queued") {
					getStructParams(fiberState).variant = [
						"Running",
						{ currentOutput, finalizers },
					];
				}
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
					// The resolver is one-shot. A resolution arriving before asyncFn
					// returns is held and applied once the step has been set up.
					let resolved = false;
					let settingUp = true;
					let earlyOutput: EffectOutput<T, E> | undefined;

					try {
						const cancellation = asyncFn((continuation) => {
							if (resolved) return;
							resolved = true;

							if (settingUp) {
								earlyOutput = continuation;
								return;
							}

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
						settingUp = false;

						if (unionKinds(fiberState) !== "Running") {
							// Cancelled during setup, before cancel could see the cleanup.
							if (earlyOutput === undefined) releaseCancelled(cancellation);
						} else if (earlyOutput === undefined) {
							getStructParams(fiberState).variant = [
								"Suspended",
								{ cancellation, finalizers },
							];
						} else {
							getStructParams(fiberState).variant = [
								"Running",
								{ currentOutput: earlyOutput, finalizers },
							];
						}
					} catch (exception: unknown) {
						complete(self, Err(Panicked(exception)));
					}
				},

				Deferred: (fn) => {
					try {
						// Unwrap one level and store the next continuation, unless the
						// step cancelled this fiber.
						const currentOutput = fn();

						if (unionKinds(fiberState) === "Running") {
							getStructParams(fiberState).variant = [
								"Running",
								{ currentOutput, finalizers },
							];
						}
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

/**
 * Runs the cleanup of async work whose fiber was cancelled while the work was
 * being set up, logging a throwing cleanup as cancel() does.
 */
function releaseCancelled(cancellation: Cancellation): void {
	try {
		cancellation?.();
	} catch (err: unknown) {
		console.error("Fiber cancellation cleanup threw:", err);
	}
}

function complete<I, T, E>(
	self: Fiber<I, T, E>,
	result: FiberResult<T, E>,
): void {
	const { fiberState } = getStructParams(self);

	// Mark Complete before finalizers run, so a re-entrant cancel is a no-op.
	match(fiberState)({
		Queued: ({ finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];

			runFinalizers(finalizers);
		},
		Running: ({ finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];

			runFinalizers(finalizers);
		},
		Suspended: ({ finalizers }) => {
			getStructParams(fiberState).variant = ["Complete", result];

			runFinalizers(finalizers);
		},
		Complete: () => {},
	});

	// Each finalizer is isolated: a throw is logged and the rest still run.
	// Rethrowing here would escape into the scheduler's turn and wedge it.
	function runFinalizers(finalizers: Finalizer<T, E>[]): void {
		for (const finalizer of finalizers) {
			try {
				finalizer(result);
			} catch (err: unknown) {
				console.error("Fiber finalizer threw:", err);
			}
		}
	}
}
