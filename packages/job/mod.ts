/**
 * `@sekhmet/job` (prototype, unpublished): named jobs run as a dependency
 * graph, in the style of GitHub Actions and other CI runners, on the
 * language's own promises and `AbortSignal`.
 *
 * - {@linkcode defineJobs} fixes the run's context type and returns `job`.
 *   A job pairs a `plan`, which declares what it needs as data, with a
 *   `run`, which receives that data with its handles resolved.
 * - {@linkcode runJobs} runs every job reachable from the roots once, and
 *   reports a {@linkcode JobOutcome} for each.
 * - {@linkcode planJobs} is the dry run: it calls the plans only and
 *   returns the graph.
 *
 * @example
 * ```ts
 * import { defineJobs, runJobs } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assert } from "@std/assert";
 *
 * const { job } = defineJobs<{ readonly release: boolean }>();
 *
 * const version = job({ name: "version", run: () => "1.2.0" });
 * const publish = job({
 * 	name: "publish",
 * 	plan: (p) => ({ version: p.needs(version), dryRun: !p.context.release }),
 * 	run: (_t, { version, dryRun }) => `${dryRun ? "would publish" : "published"} ${version}`,
 * });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: [publish], context: { release: false } }),
 * );
 * assert(report.passed);
 * ```
 *
 * @module
 */

// Cross-package types in this package's public signatures, re-exported so
// `deno doc --lint` can resolve them (one of #11's options; see that issue)
export type {
	Enum,
	Kinds,
	RawEnum,
	SomeSplitVariants,
	SomeVariant,
	Split,
	Values,
} from "@sekhmet/enum/core/mini";
export type { Result, ResultVariants } from "@sekhmet/enum/result/mini";
export { type Struct, struct } from "@sekhmet/primordials/struct";

export { JobEvent, type JobEventVariants } from "./src/event.ts";
export {
	Cycle,
	DuplicateName,
	GraphError,
	type GraphErrorVariants,
} from "./src/graph-error.ts";
export {
	type AnyJob,
	defineJobs,
	Handle,
	type HandleParams,
	type HandleReader,
	Job,
	type JobKit,
	type JobParams,
	type JobRun,
	type LeafJobDefinition,
	type NonPlainPlanCause,
	type PlannedJobDefinition,
	type Planner,
	type PlanRecord,
	type Resolved,
	type ResolvedField,
	Skip,
	type Stage,
	type StringKeysOnly,
	skip,
} from "./src/job.ts";
export {
	Blocked,
	Cancelled,
	Failed,
	JobOutcome,
	type JobOutcomeVariants,
	Skipped,
	Succeeded,
} from "./src/outcome.ts";
export {
	type JobGraph,
	JobPlan,
	type JobPlanVariants,
	type PlanOptions,
	planJobs,
} from "./src/plan.ts";
export type { ClosedPlannerCause } from "./src/planner.ts";
export {
	type JobMisuseCause,
	type RunOptions,
	type RunReport,
	runJobs,
} from "./src/run.ts";
