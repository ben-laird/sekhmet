/**
 * {@linkcode planJobs}: the dry run. It calls every plan and runs no body,
 * so it shows the graph a run would start from.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { getStructParams } from "@sekhmet/primordials/struct";
import { trackGraph } from "@/src/graph.ts";
import type { GraphError } from "@/src/graph-error.ts";
import { type AnyJob, Handle, type Job, nameOf } from "@/src/job.ts";
import { openPlanner } from "@/src/planner.ts";

/**
 * The variants of a {@linkcode JobPlan}, for type-level work on them.
 */
type Variants = Split<{
	Planned: [
		planned: { readonly needs: readonly string[]; readonly plan: object },
	];
	Skipped: [];
	Pending: [
		pending: { readonly on: string; readonly needs: readonly string[] },
	];
	Failed: [error: unknown];
}>;

export type { Variants as JobPlanVariants };

/**
 * What a dry run found for one job's plan.
 *
 * - `Planned`: the plan settled; `needs` names the jobs it declared, in
 *   order, and `plan` is its value as returned (handles unresolved).
 * - `Skipped`: the plan returned `skip()`.
 * - `Pending`: the plan awaits `p.result` or `p.outcome` of the job `on`,
 *   which only a real run produces; `needs` names what it declared first.
 * - `Failed`: the plan threw or rejected.
 */
export class JobPlan extends Enum<Variants> {}

/**
 * The graph a dry run found: each reachable job's plan, by name, in the order
 * plans reached them.
 */
export interface JobGraph {
	/** Each job's plan, by name */
	readonly jobs: ReadonlyMap<string, JobPlan>;
}

/**
 * What {@linkcode planJobs} takes.
 *
 * @template C The run's context type
 */
export interface PlanOptions<C> {
	/** The roots; every job their plans reach is planned once */
	readonly jobs: readonly Job<unknown, C>[];
	/** The context a run would get, since plans may read it */
	readonly context: C;
}

/**
 * The dry run: calls the plan of every job reachable from `jobs`, runs no
 * body, and returns the graph. Plans that await nothing settle at once; a
 * plan that awaits a job's result or outcome is reported `Pending` on that
 * job. Duplicate names and cycles are an `Err`, as in `runJobs`.
 *
 * @param options The roots and the context
 * @returns Each job's plan, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { union } from "@sekhmet/enum/core/mini";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { defineJobs, planJobs } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const build = job({ name: "build", run: () => "dist" });
 * const publish = job({
 * 	name: "publish",
 * 	plan: (p) => ({ outDir: p.needs(build), tag: "latest" }),
 * 	run: () => {},
 * });
 *
 * const graph = unwrap(await planJobs({ jobs: [publish], context: null }));
 * assertEquals([...graph.jobs.keys()], ["publish", "build"]);
 * ```
 */
export async function planJobs<C>({
	jobs,
	context,
}: PlanOptions<C>): Promise<Result<JobGraph, GraphError>> {
	const graph = trackGraph();
	const plans = new Map<AnyJob, Promise<JobPlan>>();
	let graphError: GraphError | undefined;

	for (const root of jobs) visit(root);
	let seen = -1;
	while (seen !== plans.size) {
		seen = plans.size;
		await Promise.all(plans.values());
	}

	if (graphError !== undefined) return Err(graphError);
	const found = await Promise.all(
		[...plans].map(async ([job, plan]) => [nameOf(job), await plan] as const),
	);
	return Ok({ jobs: new Map(found) });

	function visit(job: Job<unknown, C>): void {
		if (plans.has(job)) return;
		const discovered = graph.discover(job);
		if (isErr(discovered)) {
			graphError ??= unwrapErr(discovered);
			return;
		}
		// Reserve the slot first: the plan may reach other jobs synchronously
		const plan = Promise.withResolvers<JobPlan>();
		plans.set(job, plan.promise);
		plan.resolve(planOf(job));
	}

	function depend({ from, to }: { from: AnyJob; to: Job<unknown, C> }): void {
		const linked = graph.link({ from, to });
		if (isErr(linked)) {
			graphError ??= unwrapErr(linked);
			return;
		}
		visit(to);
	}

	async function planOf(job: Job<unknown, C>): Promise<JobPlan> {
		const name = nameOf(job);
		const declared: string[] = [];
		const parked = Promise.withResolvers<JobPlan>();
		const park = (on: Job<unknown, C>): Promise<never> => {
			depend({ from: job, to: on });
			parked.resolve(
				new JobPlan("Pending", { on: nameOf(on), needs: [...declared] }),
			);
			return new Promise<never>(() => {});
		};

		const { planner, close } = openPlanner<C>({
			job: name,
			context,
			needs: (need) => {
				depend({ from: job, to: need });
				declared.push(nameOf(need));
				return new Handle({ job: need });
			},
			result: park,
			outcome: park,
		});

		const { plan } = getStructParams(job);
		const settled = plan(planner).then(
			(stage) => {
				if (stage.kind === "skip") return new JobPlan("Skipped");
				return new JobPlan("Planned", {
					needs: [...new Set(declared)],
					plan: stage.plan,
				});
			},
			(error: unknown) => new JobPlan("Failed", error),
		);
		const planned = await Promise.race([settled, parked.promise]);
		close();
		return planned;
	}
}
