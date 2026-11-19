/**
 * {@linkcode planJobs}: the dry run. Plans are pure, so it calls every plan
 * and shows the whole graph, guards and conditions included, running
 * nothing.
 *
 * @module
 */

import { Ok, type Result } from "@sekhmet/enum/result/mini";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrap } from "@sekhmet/enum/result/mini/unwrap";
import { getStructParams } from "@sekhmet/primordials/struct";
import { planGraph } from "@/src/graph.ts";
import type { GraphError } from "@/src/graph-error.ts";
import type { Roots } from "@/src/job.ts";
import type { PlanRecord } from "@/src/need.ts";

/**
 * One job as a dry run found it.
 */
export interface PlannedJob {
	/** Its `runIf`, as a dry run shows it (`success()`, `always()`, `custom`) */
	readonly runIf: string;
	/** Whether it was defined with `continueOnError` */
	readonly continueOnError: boolean;
	/** What it needs, in the order its plan declared them */
	readonly needs: readonly PlannedNeed[];
	/** Its plan's value as returned, needs unresolved */
	readonly plan: PlanRecord;
}

/**
 * One need of a {@linkcode PlannedJob}.
 */
export interface PlannedNeed {
	/** The needed job's name */
	readonly job: string;
	/** The guard of a `needsIf` (`build succeeded`), else `undefined` */
	readonly when: string | undefined;
}

/**
 * The graph a dry run found.
 */
export interface JobGraph {
	/** Every reachable job, by name, in the order planning reached it */
	readonly jobs: ReadonlyMap<string, PlannedJob>;
}

/**
 * What {@linkcode planJobs} takes.
 *
 * @template C The run's context type
 * @template J The roots
 */
export interface PlanOptions<C, J extends Roots<C>> {
	/** The roots, by key; every job their plans reach is planned once */
	readonly jobs: J;
	/** The context a run would get, since plans may read it */
	readonly context: C;
}

/**
 * The dry run: calls the plan of every job reachable from `jobs`, the
 * targets of `needsIf` included, runs nothing, and returns the graph.
 * Duplicate names and cycles are an `Err`, exactly as `runJobs` finds them.
 * A plan that throws is a bug, and the throw propagates.
 *
 * @template C The run's context type
 * @template J The roots
 * @param options The roots and the context
 * @returns Each job's plan, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { always, defineJobs, planJobs } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const build = job({ name: "build", run: () => "dist" });
 * const cleanup = job({
 * 	name: "cleanup",
 * 	plan: (p) => ({ build: p.needs(build) }),
 * 	runIf: always(),
 * 	run: () => {},
 * });
 *
 * const graph = unwrap(planJobs({ jobs: { cleanup }, context: null }));
 * assertEquals([...graph.jobs.keys()], ["cleanup", "build"]);
 * assertEquals(graph.jobs.get("cleanup")?.runIf, "always()");
 * ```
 */
export function planJobs<C, J extends Roots<C>>({
	jobs,
	context,
}: PlanOptions<C, J>): Result<JobGraph, GraphError> {
	const roots = Object.values(jobs).map((job) => {
		return getStructParams(job).bind(context);
	});
	const planned = planGraph(roots);
	if (isErr(planned)) return planned;

	const found = unwrap(planned).nodes.map(({ job, plan, needs }) => {
		const planned: PlannedJob = {
			runIf: job.runIf.describe,
			continueOnError: job.continueOnError,
			plan,
			needs: needs.map(({ need, node }) => {
				return {
					job: node.job.name,
					when: getStructParams(need).guard?.describe,
				};
			}),
		};
		return [job.name, planned] as const;
	});
	return Ok({ jobs: new Map(found) });
}
