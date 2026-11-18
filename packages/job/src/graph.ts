/**
 * The graph a run discovers as plans reach jobs: names must be unique, and
 * the edges (`needs`, `result` and `outcome`) must stay acyclic.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Cycle, DuplicateName, type GraphError } from "@/src/graph-error.ts";
import { type AnyJob, nameOf } from "@/src/job.ts";

/**
 * The graph of one run (or one dry run), grown one job and one edge at a
 * time, which refuses any job or edge that would make it invalid.
 */
export interface GraphTracker {
	/**
	 * Adds `job`, unless a different job already has its name.
	 *
	 * @returns `Err(DuplicateName)` for a second job with the same name
	 */
	readonly discover: (job: AnyJob) => Result<undefined, GraphError>;
	/**
	 * Adds the edge `from` → `to` (`from`'s plan depends on `to`), unless it
	 * closes a cycle.
	 *
	 * @returns `Err(Cycle)` naming the cycle, `from` first and last
	 */
	readonly link: (edge: {
		from: AnyJob;
		to: AnyJob;
	}) => Result<undefined, GraphError>;
}

/**
 * Starts tracking an empty graph.
 *
 * @returns The tracker
 */
export function trackGraph(): GraphTracker {
	const byName = new Map<string, AnyJob>();
	const edges = new Map<AnyJob, Set<AnyJob>>();

	return {
		discover: (job) => {
			const name = nameOf(job);
			const known = byName.get(name);
			if (known !== undefined && known !== job) return Err(DuplicateName(name));
			byName.set(name, job);
			return Ok(undefined);
		},
		link: ({ from, to }) => {
			const back = pathBetween({ start: to, goal: from });
			if (back !== undefined) return Err(Cycle([from, ...back].map(nameOf)));
			const out = edges.get(from) ?? new Set();
			edges.set(from, out.add(to));
			return Ok(undefined);
		},
	};

	function pathBetween({
		start,
		goal,
		seen = new Set(),
	}: {
		start: AnyJob;
		goal: AnyJob;
		seen?: Set<AnyJob>;
	}): AnyJob[] | undefined {
		if (start === goal) return [start];
		if (seen.has(start)) return undefined;
		seen.add(start);
		for (const next of edges.get(start) ?? []) {
			const rest = pathBetween({ start: next, goal, seen });
			if (rest !== undefined) return [start, ...rest];
		}
		return undefined;
	}
}
