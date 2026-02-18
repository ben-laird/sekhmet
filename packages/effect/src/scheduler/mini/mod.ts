/**
 * Tree-shakable mini exports for the scheduler module.
 *
 * @module
 */

export {
	adaptive,
	batched,
	macrotask,
	microtask,
	sync,
	throttled,
} from "./schedules.ts";
export type {
	AdaptiveOptions,
	BatchedOptions,
	MacrotaskOptions,
	ThrottledOptions,
} from "./schedules.ts";

export { Scheduler, SchedulerState } from "./scheduler.ts";
export type {
	ScheduleContext,
	ScheduleFn,
	SchedulerOptions,
	SchedulerStateVariants,
} from "./scheduler.ts";

