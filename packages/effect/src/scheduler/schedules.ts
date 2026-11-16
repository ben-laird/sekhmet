/**
 * Factory functions that produce common {@linkcode ScheduleFn} implementations.
 *
 * @module
 */

import type { ScheduleFn } from "./scheduler.ts";

/**
 * Returns a {@linkcode ScheduleFn} that calls `runStep` synchronously and
 * immediately. Each turn executes within the same call stack frame as the
 * dispatch. Combined with the trampoline in {@linkcode Scheduler}, this is
 * safe from stack overflow regardless of queue depth.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 *
 * const scheduler = new Scheduler({ schedule: sync() });
 *
 * const ran: number[] = [];
 * scheduler.run(() => ran.push(1));
 * assertEquals(ran, [1]); // ran before run() returned
 * ```
 */
export function sync(): ScheduleFn {
	return (runStep) => runStep();
}

/**
 * Returns a {@linkcode ScheduleFn} that dispatches each turn via
 * `queueMicrotask`. Yields to the microtask queue between turns, allowing
 * Promise callbacks and other microtasks to interleave with scheduler work.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Scheduler, microtask } from "@sekhmet/effect/scheduler";
 *
 * const scheduler = new Scheduler({ schedule: microtask() });
 *
 * const ran: number[] = [];
 * scheduler.run(() => ran.push(1));
 * assertEquals(ran, []);
 * await Promise.resolve();
 * assertEquals(ran, [1]);
 * ```
 */
export function microtask(): ScheduleFn {
	return (runStep) => queueMicrotask(runStep);
}

/**
 * Options for {@linkcode macrotask}.
 */
export interface MacrotaskOptions {
	/**
	 * Minimum delay in milliseconds between turns. Defaults to `0`.
	 */
	delay?: number;
}

/**
 * Returns a {@linkcode ScheduleFn} that dispatches each turn via
 * `setTimeout`. Yields to the macrotask queue between turns, giving the
 * browser or runtime a full event loop tick to handle I/O, rendering, and
 * other tasks before resuming.
 *
 * @param options - Configuration for the macrotask schedule
 *
 * @example
 * ```ts
 * import { Scheduler, macrotask } from "@sekhmet/effect/scheduler";
 *
 * // Yield to event loop with no artificial delay
 * const scheduler = new Scheduler({ schedule: macrotask() });
 *
 * // Add a minimum delay between turns
 * const delayed = new Scheduler({ schedule: macrotask({ delay: 16 }) });
 * ```
 */
export function macrotask(options?: MacrotaskOptions): ScheduleFn {
	const delay = options?.delay ?? 0;
	return (runStep) => setTimeout(runStep, delay);
}

/**
 * Options for {@linkcode adaptive}.
 */
export interface AdaptiveOptions {
	/**
	 * When `queueDepth` is at or above this value, use `queueMicrotask`
	 * (aggressive — drain quickly). Defaults to `16`.
	 */
	busyThreshold?: number;
}

/**
 * Returns a {@linkcode ScheduleFn} that dynamically chooses between
 * `queueMicrotask` and `setTimeout` based on the current `queueDepth`.
 *
 * When the queue is deep (at or above `busyThreshold`), it uses
 * `queueMicrotask` to drain aggressively. When the queue is shallow, it
 * uses `setTimeout` to yield generously to the event loop.
 *
 * @param options - Thresholds controlling when to switch strategies
 *
 * @example
 * ```ts
 * import { Scheduler, adaptive } from "@sekhmet/effect/scheduler";
 *
 * const scheduler = new Scheduler({
 *   schedule: adaptive({ busyThreshold: 32 }),
 * });
 * ```
 */
export function adaptive(options?: AdaptiveOptions): ScheduleFn {
	const busyThreshold = options?.busyThreshold ?? 16;
	return (runStep, { queueDepth }) => {
		if (queueDepth >= busyThreshold) {
			queueMicrotask(runStep);
		} else {
			setTimeout(runStep, 0);
		}
	};
}

/**
 * Options for {@linkcode throttled}.
 */
export interface ThrottledOptions {
	/**
	 * Maximum number of consecutive synchronous turns before forcing a
	 * macrotask yield. Must be a positive integer. Defaults to `4`.
	 */
	turnsPerTick?: number;
}

/**
 * Returns a {@linkcode ScheduleFn} that runs up to `turnsPerTick` consecutive
 * turns synchronously, then yields to the macrotask queue for one tick before
 * resuming. Uses `turnIndex` to determine when to yield.
 *
 * This balances throughput (multiple turns per tick) with responsiveness
 * (periodic macrotask yields so I/O and rendering are not starved).
 *
 * @param options - Configuration for the throttle behaviour
 *
 * @example
 * ```ts
 * import { Scheduler, throttled } from "@sekhmet/effect/scheduler";
 *
 * // Run 4 turns back-to-back, then yield to the event loop
 * const scheduler = new Scheduler({ schedule: throttled({ turnsPerTick: 4 }) });
 * ```
 */
export function throttled(options?: ThrottledOptions): ScheduleFn {
	const turnsPerTick = options?.turnsPerTick ?? 4;
	return (runStep, { turnIndex }) => {
		if (turnIndex % turnsPerTick === 0) {
			// Every `turnsPerTick` turns, yield to the macrotask queue
			setTimeout(runStep, 0);
		} else {
			// Otherwise run synchronously to keep throughput high
			runStep();
		}
	};
}

/**
 * Options for {@linkcode batched}.
 */
export interface BatchedOptions {
	/**
	 * When the last turn ran fewer steps than this value, treat the queue
	 * as draining and back off to `setTimeout`. When at or above this value,
	 * treat the queue as under load and use `queueMicrotask`. Defaults to the
	 * scheduler's effective step budget (but since that is not visible here,
	 * defaults to `64` as a practical midpoint).
	 */
	fullTurnThreshold?: number;
}

/**
 * Returns a {@linkcode ScheduleFn} that uses `stepsLastTurn` to decide
 * whether the scheduler is under load. If the previous turn ran at or above
 * `fullTurnThreshold` steps (i.e., the budget was exhausted), the queue is
 * considered busy and `queueMicrotask` is used to drain quickly. If the
 * previous turn ran fewer steps (queue is nearly empty), `setTimeout` is used
 * to yield generously.
 *
 * On the first scheduling call (`stepsLastTurn === 0`), defaults to
 * `queueMicrotask` so the first batch of work starts promptly.
 *
 * @param options - Configuration for the batch threshold
 *
 * @example
 * ```ts
 * import { Scheduler, batched } from "@sekhmet/effect/scheduler";
 *
 * const scheduler = new Scheduler({
 *   schedule: batched({ fullTurnThreshold: 128 }),
 *   stepBudget: 128,
 * });
 * ```
 */
export function batched(options?: BatchedOptions): ScheduleFn {
	const fullTurnThreshold = options?.fullTurnThreshold ?? 64;
	return (runStep, { stepsLastTurn }) => {
		// stepsLastTurn === 0 on the first call (no prior turn); treat as busy
		// so the initial batch starts immediately.
		if (stepsLastTurn === 0 || stepsLastTurn >= fullTurnThreshold) {
			queueMicrotask(runStep);
		} else {
			setTimeout(runStep, 0);
		}
	};
}
