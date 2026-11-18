/**
 * The `p` a plan receives, open only while the plan runs.
 *
 * @module
 */

import { Panic, panic } from "@sekhmet/panic/mini/core";
import type { Planner } from "@/src/job.ts";

/**
 * The cause of a panic for a `p` used after its plan settled.
 */
export interface ClosedPlannerCause {
	/** The job whose plan `p` belonged to */
	readonly job: string;
	/** The method called on it */
	readonly method: "needs" | "result" | "outcome";
}

/**
 * Wraps a runner's `needs`, `result` and `outcome` as the `p` for one plan.
 * Once `close` is called, using `p` panics: a plan that leaks `p` into a
 * callback would otherwise add needs after the runner decided the job.
 *
 * @param behaviour.job The planning job's name, for the panic
 * @param behaviour.context The run's context
 * @returns The planner, and `close` to call when the plan settles
 */
export function openPlanner<C>({
	job,
	context,
	needs,
	result,
	outcome,
}: { readonly job: string } & Planner<C>): {
	planner: Planner<C>;
	close: () => void;
} {
	let open = true;
	const ensureOpen = (method: ClosedPlannerCause["method"]): void => {
		if (open) return;
		panic<ClosedPlannerCause>({
			name: "ClosedPlanner",
			message: `p.${method}() was called after the plan of job "${job}" settled`,
			cause: { job, method },
		});
	};

	return {
		planner: {
			context,
			needs: (need) => {
				ensureOpen("needs");
				return needs(need);
			},
			result: (need) => {
				ensureOpen("result");
				return result(need);
			},
			outcome: (need) => {
				ensureOpen("outcome");
				return outcome(need);
			},
		},
		close: () => {
			open = false;
		},
	};
}

/**
 * The cause of the `UnexplainedErr` panic.
 */
export interface UnexplainedErrCause {
	/** The job whose plan returned the `Err` */
	readonly job: string;
}

/**
 * The panic for a plan that returned an `Err` while every job it needed or
 * awaited with `p.result` succeeded, so nothing in its own plan explains it:
 * an `Err` it built itself (typed code can), or one from another plan's
 * `p.result`.
 *
 * @param job The planning job's name
 * @returns The panic, to record as the job's failure (it is not thrown)
 */
export function unexplainedErr(job: string): Panic<UnexplainedErrCause> {
	return new Panic({
		name: "UnexplainedErr",
		message: `the plan of job "${job}" returned an Err, but every job it needed or awaited succeeded`,
		cause: { job },
	});
}
