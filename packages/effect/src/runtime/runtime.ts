/**
 * Runtime execution environment for effects.
 *
 * @module
 */

import type { Scheduler } from "@sekhmet/effect/scheduler";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";

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
 * Configuration for the runtime execution environment.
 */
export interface RuntimeConfig {
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
	 * The runtime configuration including scheduler and fiber settings.
	 */
	config: RuntimeConfig;
}

/**
 * A Runtime provides the execution environment for effects.
 * It holds the input value that effects receive when they start.
 *
 * @template I - Input type for effects
 */
export class Runtime<I> extends Struct<RuntimeParams<I>> {
	/**
	 * Creates an execution context from this runtime's configuration.
	 */
	createContext(): ExecutionContext {
		return new ExecutionContext({ config: getStructParams(this).config });
	}
}

/**
 * Parameters for the ExecutionContext struct.
 */
export interface ExecutionContextParams {
	/**
	 * The runtime configuration for this execution context.
	 */
	config: RuntimeConfig;
}

/**
 * Holds the runtime configuration for a single fiber execution turn.
 */
export class ExecutionContext extends Struct<ExecutionContextParams> {}
