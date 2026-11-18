/**
 * The `p` a plan receives, open only while the plan runs.
 *
 * @module
 */

import { Err } from "@sekhmet/enum/result/mini";
import { Panic, panic } from "@sekhmet/panic/mini/core";
import { Handle, nameOf, type Planner } from "@/src/job.ts";
import { Cancelled } from "@/src/outcome.ts";

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
 * Where a plan's `p` stands: open while the plan runs, closed once the plan
 * settled, abandoned when the runner stopped waiting for it.
 */
type PlannerState = "open" | "closed" | "abandoned";

/**
 * Wraps a runner's `needs`, `result` and `outcome` as the `p` for one plan.
 *
 * - `close`, once the plan settled: using `p` then panics, since a plan that
 *   leaks `p` into a callback would add needs after the runner decided.
 * - `abandon`, when the run was cancelled under a still-running plan: `p`
 *   turns inert, so the plan can finish (its `finally` included) without a
 *   panic and without touching the run. `needs` returns a handle that
 *   schedules nothing; `result` and `outcome` resolve as `Cancelled`.
 *
 * @param behaviour.job The planning job's name, for the panic
 * @param behaviour.context The run's context
 * @returns The planner, `close` and `abandon`
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
	abandon: () => void;
} {
	let state: PlannerState = "open";
	const ensureNotClosed = (method: ClosedPlannerCause["method"]): void => {
		if (state !== "closed") return;
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
				ensureNotClosed("needs");
				if (state === "abandoned") return new Handle({ job: need });
				return needs(need);
			},
			result: async (need) => {
				ensureNotClosed("result");
				if (state === "abandoned") {
					return Err({ job: nameOf(need), outcome: Cancelled() });
				}
				return await result(need);
			},
			outcome: async (need) => {
				ensureNotClosed("outcome");
				if (state === "abandoned") return Cancelled();
				return await outcome(need);
			},
		},
		close: () => {
			state = "closed";
		},
		abandon: () => {
			state = "abandoned";
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
