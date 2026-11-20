/**
 * How a run's outcomes decide its verdict.
 *
 * @module
 */

import type { JobEnd } from "@/src/end/main/mod.ts";

/**
 * A job's {@linkcode JobEnd} with the option that changes how it counts.
 */
export interface CountedEnd {
	/** The job's outcome */
	readonly outcome: JobEnd<unknown>;
	/** Whether the job was defined with `continueOnError` */
	readonly continueOnError: boolean;
}

/**
 * Whether a run passed: every job reached is passing (`Succeeded` or
 * `Skipped`), or `Failed` with `continueOnError`.
 *
 * @param outcomes Every job's outcome in the run
 * @returns `true` if the run passed
 */
export function passed(outcomes: Iterable<CountedEnd>): boolean {
	for (const { outcome, continueOnError } of outcomes) {
		if (outcome.isPassing()) continue;
		if (outcome.isFailed() && continueOnError) continue;
		return false;
	}
	return true;
}
