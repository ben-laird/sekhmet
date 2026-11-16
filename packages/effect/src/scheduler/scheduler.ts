/**
 * Task scheduler for cooperative concurrency.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { getStructParams } from "@sekhmet/primordials/struct";

/**
 * The default maximum number of tasks to execute per scheduler turn
 * before yielding control back to the scheduling function.
 */
const DEFAULT_STEP_BUDGET = 128;

/**
 * Contextual information passed to a {@linkcode ScheduleFn} each time it is
 * called. Can be used to make dynamic scheduling decisions.
 */
export interface ScheduleContext {
	/**
	 * The number of tasks waiting in the queue when this scheduling call is made.
	 */
	readonly queueDepth: number;

	/**
	 * The zero-based index of the turn about to be dispatched.
	 * Increments with each call to the scheduling function.
	 */
	readonly turnIndex: number;

	/**
	 * The number of tasks that ran in the most recently completed turn.
	 * Zero on the first scheduling call (no prior turn has run).
	 */
	readonly stepsLastTurn: number;
}

/**
 * A function that controls when a unit of scheduled work runs.
 * Receives a `runStep` callback and contextual information about the
 * scheduler's current state, and is responsible for calling `runStep`.
 *
 * @example Synchronous (immediate):
 * ```ts
 * import type { ScheduleFn } from "@sekhmet/effect/scheduler";
 *
 * const syncSchedule: ScheduleFn = (runStep) => runStep();
 * ```
 *
 * @example Microtask queue:
 * ```ts
 * import type { ScheduleFn } from "@sekhmet/effect/scheduler";
 *
 * const microtaskSchedule: ScheduleFn = (runStep) => queueMicrotask(runStep);
 * ```
 *
 * @example Dynamic — microtask when busy, macrotask when idle:
 * ```ts
 * import type { ScheduleFn } from "@sekhmet/effect/scheduler";
 *
 * const adaptiveSchedule: ScheduleFn = (runStep, { queueDepth }) => {
 *   if (queueDepth > 10) {
 *     queueMicrotask(runStep);
 *   } else {
 *     setTimeout(runStep, 0);
 *   }
 * };
 * ```
 */
export type ScheduleFn = (
	runStep: () => void,
	context: ScheduleContext,
) => void;

/**
 * Configuration options for creating a {@linkcode Scheduler}.
 */
export interface SchedulerOptions {
	/**
	 * The scheduling function that controls when each batch of tasks runs.
	 */
	schedule: ScheduleFn;

	/**
	 * Maximum number of tasks to execute per scheduler turn before yielding.
	 * Must be a positive integer. Defaults to 128.
	 */
	stepBudget?: number;
}

/**
 * Variants representing the execution state of a scheduler.
 *
 * - `Idle`: No tasks queued, no drain pending.
 * - `Scheduled`: A drain turn is pending (tasks enqueued, waiting for scheduling function to dispatch).
 * - `Running`: Actively executing tasks inside a drain turn.
 */
export type SchedulerStateVariants = Split<{
	Idle: [];
	Scheduled: [];
	Running: [];
}>;

/**
 * Represents the execution state of a {@linkcode Scheduler}.
 */
export class SchedulerState extends Enum<SchedulerStateVariants> {}

/**
 * A cooperative task scheduler for `() => void` tasks.
 *
 * Tasks enqueued via {@linkcode Scheduler.run} are executed in FIFO order.
 * A {@linkcode SchedulerOptions.stepBudget} limits how many tasks run per turn,
 * yielding to the scheduling function between turns. For synchronous scheduling
 * functions, a trampoline prevents call stack overflow by detecting synchronous
 * re-scheduling and looping rather than recursing.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Scheduler } from "@sekhmet/effect/scheduler";
 *
 * const scheduler = new Scheduler({
 *   // Use the context to make dynamic scheduling decisions
 *   schedule: (runStep, { queueDepth }) => {
 *     if (queueDepth > 50) queueMicrotask(runStep);
 *     else setTimeout(runStep, 0);
 *   },
 *   stepBudget: 128,
 * });
 *
 * const ran: string[] = [];
 * scheduler.run(() => ran.push("task 1"));
 * scheduler.run(() => ran.push("task 2"));
 *
 * // Nothing runs until the scheduling function dispatches the turn
 * assertEquals(ran, []);
 * await new Promise((resolve) => setTimeout(resolve, 0));
 * assertEquals(ran, ["task 1", "task 2"]);
 * ```
 */
export class Scheduler {
	readonly #schedule: ScheduleFn;
	readonly #stepBudget: number;
	readonly #queue: Array<() => void>;
	readonly #state: SchedulerState;
	#turnIndex: number;
	#stepsLastTurn: number;

	/**
	 * Creates a new `Scheduler` with the given options.
	 *
	 * @param options - Configuration for scheduling behaviour and step budget
	 */
	constructor(options: SchedulerOptions) {
		this.#schedule = options.schedule;
		this.#stepBudget = options.stepBudget ?? DEFAULT_STEP_BUDGET;
		this.#queue = [];
		this.#state = new SchedulerState("Idle");
		this.#turnIndex = 0;
		this.#stepsLastTurn = 0;
	}

	/**
	 * The current execution state of this scheduler.
	 */
	get state(): SchedulerState {
		return this.#state;
	}

	/**
	 * Enqueues a task for execution by this scheduler.
	 *
	 * If the scheduler is `Idle`, transitions to `Scheduled` and dispatches
	 * a drain turn via the scheduling function. If `Running` or `Scheduled`,
	 * the task is enqueued and the active drain will pick it up.
	 *
	 * @param task - The task to run
	 */
	run(task: () => void): void {
		this.#queue.push(task);

		match(this.#state)({
			Idle: () => {
				getStructParams(this.#state).variant = ["Scheduled"];
				this.#dispatch(() => this.#drain());
			},
			Scheduled: () => {},
			Running: () => {},
		});
	}

	/**
	 * Calls the scheduling function with a context snapshot and a drain callback.
	 * Increments the turn index for each dispatch.
	 */
	#dispatch(runStep: () => void): void {
		const context: ScheduleContext = {
			queueDepth: this.#queue.length,
			turnIndex: this.#turnIndex++,
			stepsLastTurn: this.#stepsLastTurn,
		};

		this.#schedule(runStep, context);
	}

	/**
	 * Entry point for execution. Sets state to `Running` and starts the turn loop.
	 */
	#drain(): void {
		getStructParams(this.#state).variant = ["Running"];
		this.#runTurns();
	}

	/**
	 * Drives the turn loop. Runs one turn at a time, yielding between turns via
	 * the scheduling function.
	 *
	 * Uses a trampoline to handle synchronous scheduling functions without stack
	 * overflow. When the budget is exhausted, `#dispatch` is called with a
	 * continuation. A `stillInDispatch` flag detects whether the scheduling
	 * function called back synchronously (loop again) or asynchronously (start a
	 * fresh `#runTurns` from the callback). Stack depth stays O(1).
	 */
	#runTurns(): void {
		while (true) {
			this.#runOneTurn();

			if (this.#queue.length === 0) {
				getStructParams(this.#state).variant = ["Idle"];
				break;
			}

			// Budget exhausted with tasks remaining — detect sync vs async dispatch.
			let stillInDispatch = true;
			let syncReschedule = false;

			this.#dispatch(() => {
				if (stillInDispatch) {
					syncReschedule = true; // sync: loop again without recursing
				} else {
					this.#runTurns(); // async: start a fresh turn loop from the callback
				}
			});

			stillInDispatch = false;

			if (!syncReschedule) {
				getStructParams(this.#state).variant = ["Scheduled"];
				break;
			}
			// sync: loop continues without recursing
		}
	}

	/**
	 * Executes one batch of tasks up to the step budget. Pure work — no control
	 * flow decisions, just state mutation.
	 */
	#runOneTurn(): void {
		const batch = this.#queue.splice(0, this.#stepBudget);
		for (const task of batch) {
			task();
		}
		this.#stepsLastTurn = batch.length;
	}
}
