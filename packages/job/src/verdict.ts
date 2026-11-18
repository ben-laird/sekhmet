/**
 * How a job's needs decide it before its body starts, and how a run's
 * outcomes decide its verdict.
 *
 * @module
 */

import { isolate } from "@sekhmet/enum/core/mini";
import {
	Blocked,
	Cancelled,
	isUnhealthy,
	type JobOutcome,
	Skipped,
} from "@/src/outcome.ts";

/**
 * A settled need: the needed job's name and outcome.
 */
export interface SettledNeed {
	/** The needed job's name */
	readonly name: string;
	/** Its outcome in this run */
	readonly outcome: JobOutcome<unknown>;
}

/**
 * Decides a job from its settled needs, before its body starts.
 *
 * In order of precedence:
 *
 * 1. any `Failed` or `Blocked` need: `Blocked`, naming each such need once,
 *    in declaration order;
 * 2. any `Cancelled` need: `Cancelled`;
 * 3. any `Skipped` need: `Skipped` (a skipped job has no value to pass on);
 * 4. otherwise every need succeeded: `undefined`, so the body may run.
 *
 * @param needs The settled needs, in declaration order
 * @returns The outcome the needs force, or `undefined` to run
 */
export function decideFromNeeds(
	needs: readonly SettledNeed[],
): JobOutcome<never> | undefined {
	const unhealthy = needs.filter(({ outcome }) => isUnhealthy(outcome));
	const blockedBy = [...new Set(unhealthy.map(({ name }) => name))];
	if (blockedBy.length > 0) return Blocked(blockedBy);
	if (needs.some(({ outcome }) => isolate(outcome, "Cancelled"))) {
		return Cancelled();
	}
	if (needs.some(({ outcome }) => isolate(outcome, "Skipped"))) {
		return Skipped();
	}
	return undefined;
}

/**
 * A job's outcome with the option that changes how it counts.
 */
export interface CountedOutcome {
	/** The job's outcome */
	readonly outcome: JobOutcome<unknown>;
	/** Whether the job was defined with `continueOnError` */
	readonly continueOnError: boolean;
}

/**
 * Whether a run passed: no job `Failed` without `continueOnError`, and none
 * was `Cancelled`. `Blocked` jobs don't count on their own; a failure blocked
 * them, and that failure decides, as in `scripts/ci`.
 *
 * @param outcomes Every job's outcome in the run
 * @returns `true` if the run passed
 */
export function passed(outcomes: Iterable<CountedOutcome>): boolean {
	for (const { outcome, continueOnError } of outcomes) {
		if (isolate(outcome, "Failed") && !continueOnError) return false;
		if (isolate(outcome, "Cancelled")) return false;
	}
	return true;
}
