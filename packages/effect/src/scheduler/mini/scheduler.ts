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
 * ```ts ignore
 * const syncSchedule: ScheduleFn = (runStep) => runStep();
 * ```
 *
 * @example Microtask queue:
 * ```ts ignore
 * const microtaskSchedule: ScheduleFn = (runStep) => queueMicrotask(runStep);
 * ```
 *
 * @example Dynamic — microtask when busy, macrotask when idle:
 * ```ts ignore
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
 * ```ts ignore
 * const scheduler = new Scheduler({
 *   schedule: (runStep, { queueDepth, turnIndex }) => {
 *     // Use context to make dynamic scheduling decisions
 *     queueDepth > 50 ? queueMicrotask(runStep) : setTimeout(runStep, 0);
 *   },
 *   stepBudget: 128,
 * });
 *
 * scheduler.run(() => console.log("task 1"));
 * scheduler.run(() => console.log("task 2"));
 * ```
 */
export class Scheduler {
	readonly #schedule: ScheduleFn;
	readonly #stepBudget: number;
	readonly #queue: Array<() => void>;
	readonly #state: SchedulerState;
	#turnIndex: number;
	#stepsLastTurn: number;

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
				this.#dispatch();
			},
			Scheduled: () => {},
			Running: () => {},
		});
	}

	/**
	 * Calls the scheduling function with a context snapshot and a drain callback.
	 * Increments the turn index for each dispatch.
	 */
	#dispatch(runStep: () => void = () => this.#drain()): void {
		const context: ScheduleContext = {
			queueDepth: this.#queue.length,
			turnIndex: this.#turnIndex++,
			stepsLastTurn: this.#stepsLastTurn,
		};

		this.#schedule(runStep, context);
	}

	/**
	 * Internal drain loop. Runs tasks up to the step budget per turn.
	 * Uses a trampoline to handle synchronous scheduling functions
	 * without stack overflow: synchronous re-scheduling is detected via
	 * a flag and handled by looping rather than recursing.
	 */
	#drain(): void {
		getStructParams(this.#state).variant = ["Running"];

		// Outer trampoline loop: for synchronous schedulers, instead of
		// recursing into a new #drain() call when the budget is exhausted,
		// we detect the synchronous re-schedule and loop back. Stack depth O(1).
		let keepGoing = true;

		while (keepGoing) {
			keepGoing = false;

			let steps = 0;

			while (this.#queue.length > 0 && steps < this.#stepBudget) {
				const task = this.#queue.shift();
				if (task === undefined) break;
				steps++;
				task();
			}

			this.#stepsLastTurn = steps;

			if (this.#queue.length > 0) {
				// Budget exhausted with tasks remaining.
				// We need to yield and re-schedule. Detect whether the scheduling
				// function dispatches synchronously (before returning) or asynchronously.
				//
				// The callback uses a closed-over flag to decide what to do:
				// - If called synchronously: set keepGoing=true so the outer loop
				//   continues (trampoline — no new stack frame).
				// - If called asynchronously: start a fresh #drain() call.
				let stillInDispatchCall = true;

				this.#dispatch(() => {
					if (stillInDispatchCall) {
						// Synchronous path: we're still inside the #dispatch() call.
						// Signal the outer loop to continue rather than recursing.
						keepGoing = true;
					} else {
						// Async path: #drain() has already returned. Start a fresh drain.
						this.#drain();
					}
				});

				stillInDispatchCall = false;

				if (!keepGoing) {
					// Async scheduler: yield and let the callback handle resumption.
					getStructParams(this.#state).variant = ["Scheduled"];
					return;
				}
				// Synchronous scheduler: keepGoing=true, state stays Running,
				// the outer while loop handles the next turn without a new stack frame.
			} else {
				getStructParams(this.#state).variant = ["Idle"];
			}
		}
	}
}
