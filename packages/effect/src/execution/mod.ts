import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { Effect } from "../effect/mini/effect.ts";
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
