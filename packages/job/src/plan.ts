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
import { unerased } from "@/src/erasure.ts";
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
 * @template M The run's metadata type
 * @template J The roots
 */
export interface PlanOptions<M, J extends Roots<M>> {
	/** The roots, by key; every job their plans reach is planned once */
	readonly jobs: J;
	/** The metadata a run would get, since plans may read it */
	readonly meta: M;
}

/**
 * What {@linkcode planJobs} takes when every root's metadata type accepts
 * `undefined` (a factory that ignores its parameter, or annotates it
 * `Config | undefined`): `meta` may be omitted.
 *
 * @template J The roots
 */
export interface OptionalMetaPlanOptions<J extends Roots<undefined>>
	extends Omit<PlanOptions<undefined, J>, "meta"> {
	/** The metadata a run would get: omitted, every plan reads `undefined` */
	readonly meta?: undefined;
}

/**
 * The dry run: calls the plan of every job reachable from `jobs`, the
 * targets of `needsIf` included, runs nothing, and returns the graph.
 * Every `GraphError` (a duplicate name or family key, a guard reading
 * outside its plan, a cycle) is an `Err`, exactly as `runJobs` finds it.
 * A plan that throws is a bug, and the throw propagates. No job starts, so
 * no context factory is called.
 *
 * This overload is for roots whose metadata type accepts `undefined`, as
 * with a factory that ignores its parameter (`defineJobs(() => ({}))`):
 * `meta` may be omitted, and every plan then reads `undefined`. Otherwise
 * `meta` is required (the next overload).
 *
 * @template J The roots
 * @param options The roots
 * @returns Each job's plan, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { always, defineJobs, planJobs } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs(() => ({}));
 * const build = job({ name: "build", run: () => "dist" });
 * const cleanup = job({
 * 	name: "cleanup",
 * 	plan: (p) => ({ build: p.needs(build) }),
 * 	runIf: always(),
 * 	run: () => {},
 * });
 *
 * const graph = unwrap(planJobs({ jobs: { cleanup } }));
 * assertEquals([...graph.jobs.keys()], ["cleanup", "build"]);
 * assertEquals(graph.jobs.get("cleanup")?.runIf, "always()");
 * ```
 */
export function planJobs<J extends Roots<undefined>>(
	options: OptionalMetaPlanOptions<J>,
): Result<JobGraph, GraphError>;
/**
 * The dry run, given the metadata `meta` a run would get, since plans may
 * read it. What it finds is as the overload without `meta` describes.
 *
 * @template M The run's metadata type
 * @template J The roots
 * @param options The roots and the metadata
 * @returns Each job's plan, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { defineJobs, planJobs } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs((_meta: { readonly release: boolean }) => ({}));
 * const publish = job({ name: "publish", run: () => {} });
 * const ship = job({
 * 	name: "ship",
 * 	plan: (p) => (p.meta.release ? { publish: p.needs(publish) } : {}),
 * 	run: () => {},
 * });
 *
 * const graph = unwrap(planJobs({ jobs: { ship }, meta: { release: false } }));
 * assertEquals([...graph.jobs.keys()], ["ship"]);
 * ```
 */
export function planJobs<M, J extends Roots<M>>(
	options: PlanOptions<M, J>,
): Result<JobGraph, GraphError>;
export function planJobs<M, J extends Roots<M>>({
	jobs,
	meta,
}: Omit<PlanOptions<M, J>, "meta"> & { readonly meta?: M }): Result<
	JobGraph,
	GraphError
> {
	// An omitted meta is undefined, which the overloads admit only for roots
	// whose metadata accepts it
	const given = unerased<M>(meta);
	const roots = Object.values(jobs).map((job) => {
		return getStructParams(job).bind(given);
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
