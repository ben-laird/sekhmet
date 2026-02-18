/**
 * Kitchen sink exports for the scheduler module.
 *
 * @module
 */

export {
	adaptive,
	batched,
	macrotask,
	microtask,
	Scheduler,
	SchedulerState,
	sync,
	throttled,
} from "../mini/mod.ts";
export type {
	AdaptiveOptions,
	BatchedOptions,
	MacrotaskOptions,
	ScheduleContext,
	ScheduleFn,
	SchedulerOptions,
	SchedulerStateVariants,
	ThrottledOptions,
} from "../mini/mod.ts";
