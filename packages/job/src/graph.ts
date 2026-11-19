/**
 * Planning the graph: every plan is pure, so a run (and a dry run) calls
 * each reachable job's plan once, up front, and checks the graph before
 * anything starts.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { panic } from "@sekhmet/panic/mini/core";
import { getStructParams } from "@sekhmet/primordials/struct";
import { Cycle, DuplicateName, type GraphError } from "@/src/graph-error.ts";
import type { BoundJob, JobId } from "@/src/job.ts";
import type { AnyNeed, PlanRecord } from "@/src/need.ts";
import { collectNeeds, isPlainRecord } from "@/src/plan-data.ts";

/**
 * One job of a planned graph: its plan, and the jobs that plan needs.
 */
export interface GraphNode {
	/** The job, bound to the run's context */
	readonly job: BoundJob<unknown>;
	/** What its plan returned, needs unresolved */
	readonly plan: PlanRecord;
	/** Each need in the plan, in declaration order, with its job's node */
	readonly needs: readonly NodeNeed[];
}

/**
 * A need of a {@linkcode GraphNode}, with the node of the job it needs.
 */
export interface NodeNeed {
	/** The need, as it sits in the plan */
	readonly need: AnyNeed;
	/** The needed job's node */
	readonly node: GraphNode;
}

/**
 * A planned graph.
 */
export interface Graph {
	/** The roots' nodes, in the order given */
	readonly roots: readonly GraphNode[];
	/** Every reachable node, in the order planning reached it */
	readonly nodes: readonly GraphNode[];
}

/**
 * The cause of the panic for a plan that isn't a plain object, which only
 * untyped (JavaScript) callers can return.
 */
export interface NonPlainPlanCause {
	/** The job whose plan returned it */
	readonly job: string;
	/** What it returned */
	readonly plan: unknown;
}

/**
 * Calls the plan of every job reachable from `roots`, `needsIf` targets
 * included, once per identity.
 *
 * A plan that throws is a bug: the throw propagates, before any job runs.
 *
 * @param roots The roots, bound to the run's context
 * @returns The graph, or the first duplicate name or cycle found
 */
export function planGraph(
	roots: readonly BoundJob<unknown>[],
): Result<Graph, GraphError> {
	const known = new Map<symbol, Map<string, GraphNode>>();
	const names = new Map<string, JobId>();
	const nodes: GraphNode[] = [];
	const path: GraphNode[] = [];
	let error: GraphError | undefined;

	const visit = (job: BoundJob<unknown>): GraphNode | undefined => {
		const found = known.get(job.id.family)?.get(job.id.key);
		if (found !== undefined) {
			const at = path.indexOf(found);
			if (at !== -1) {
				const cycle = [...path.slice(at), found].map((node) => node.job.name);
				error ??= Cycle(cycle);
			}
			return found;
		}
		if (names.has(job.name)) {
			error ??= DuplicateName(job.name);
			return undefined;
		}
		names.set(job.name, job.id);

		const needs: NodeNeed[] = [];
		const node: GraphNode = { job, plan: planOf(job), needs };
		const family = known.get(job.id.family) ?? new Map<string, GraphNode>();
		known.set(job.id.family, family.set(job.id.key, node));
		nodes.push(node);

		path.push(node);
		for (const need of collectNeeds(node.plan)) {
			const target = visit(getStructParams(need).job);
			if (target !== undefined) needs.push({ need, node: target });
		}
		path.pop();
		return node;
	};

	const planned = roots.flatMap((root) => visit(root) ?? []);
	if (error !== undefined) return Err(error);
	return Ok({ roots: planned, nodes });
}

/** Calls a job's plan, and panics unless it returned a plain object. */
function planOf(job: BoundJob<unknown>): PlanRecord {
	const plan: unknown = job.plan();
	if (isPlainRecord(plan)) return plan;

	return panic<NonPlainPlanCause>({
		name: "NonPlainPlan",
		message: `the plan of job "${job.name}" must return a plain object`,
		cause: { job: job.name, plan },
	});
}
