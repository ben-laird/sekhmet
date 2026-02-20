/**
 * Runtime execution environment for effects.
 *
 * @module
 */

import type { Scheduler } from "@sekhmet/effect/scheduler/mini";
import { Struct } from "@sekhmet/primordials/struct";

/**
 * Configuration for fiber execution.
 */
export interface FiberConfig {
	/**
	 * Maximum number of steps to execute before yielding to the scheduler.
	 * After this budget is exhausted, the fiber reschedules itself.
	 * @default 1024
	 */
	readonly stepBudget: number;
}

/**
 * Parameters for the Runtime struct.
 *
 * @template I - Input type for effects
 */
export interface RuntimeParams<I> {
	/**
	 * The input value that will be provided to effects when they run.
	 */
	input: I;
	/**
	 * The scheduler that manages fiber execution turns.
	 */
	scheduler: Scheduler;
	/**
	 * Optional fiber execution configuration. Defaults to a step budget of 1024.
	 */
	fiberConfig?: FiberConfig | undefined;
}

/**
 * A Runtime provides the execution environment for effects.
 * It holds the input value that effects receive when they start.
 *
 * @template I - Input type for effects
 */
export class Runtime<I> extends Struct<RuntimeParams<I>> {}
