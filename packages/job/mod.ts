/**
 * `@sekhmet/job` (prototype, unpublished): named jobs run as a dependency
 * graph, in the style of GitHub Actions and other CI runners, on the
 * language's own promises and `AbortSignal`.
 *
 * - {@linkcode defineJobs} fixes the run's context type and returns `job`.
 *   A job pairs a pure `plan`, which declares what it needs as data
 *   (`p.needs`, or `p.needsIf` with a guard), with a `run`, which receives
 *   that data with each need resolved.
 * - A job's `runIf` decides whether `run` is called once its needs settle:
 *   {@linkcode success} (the default), {@linkcode failure},
 *   {@linkcode cancelled}, {@linkcode always}, or a predicate.
 * - {@linkcode runJobs} runs every job reachable from a record of roots
 *   once, and reports each root's {@linkcode JobOutcome}, typed per key.
 * - {@linkcode planJobs} is the dry run: it calls the plans only and
 *   returns the whole graph, guards included.
 *
 * @example
 * ```ts
 * import { always, defineJobs, runJobs } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<{ readonly release: boolean }>();
 *
 * const version = job({ name: "version", run: () => "1.2.0" });
 * const publish = job({
 * 	name: "publish",
 * 	plan: (p) => ({ version: p.needs(version), dryRun: !p.context.release }),
 * 	run: (_t, { version, dryRun }) => `${dryRun ? "would publish" : "published"} ${version}`,
 * });
 * const cleanup = job({
 * 	name: "cleanup",
 * 	plan: (p) => ({ publish: p.needs(publish) }),
 * 	runIf: always(),
 * 	run: (_t, { publish }) => publish.isSucceeded(),
 * });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: { publish, cleanup }, context: { release: false } }),
 * );
 * assert(report.passed);
 * assertEquals(report.outcomes.publish.value().unwrap(), "would publish 1.2.0");
 * ```
 *
 * @module
 */

export {
	always,
	type Condition,
	type ConditionInput,
	cancelled,
	failure,
	type NeedOutcomes,
	success,
} from "./src/condition.ts";
export { JobEvent, type JobEventVariants } from "./src/event.ts";
export type { NonPlainPlanCause } from "./src/graph.ts";
export {
	Cycle,
	DuplicateName,
	GraphError,
	type GraphErrorVariants,
} from "./src/graph-error.ts";
export {
	failed,
	type SucceededWithOptions,
	succeeded,
	succeededWith,
} from "./src/guard.ts";
export {
	type AnyJob,
	type AnyJobDefinition,
	type BodyInput,
	type BoundJob,
	defineJobs,
	type EmptyPlan,
	Job,
	type JobDefinitionBase,
	type JobId,
	type JobKit,
	type JobParams,
	type JobRun,
	type Roots,
	type RunIfInput,
	type ShouldRunInput,
	type StepDefinition,
	type SuccessJobDefinition,
} from "./src/job.ts";
export {
	type AnyNeed,
	type ConditionKind,
	type Field,
	type Guard,
	Need,
	type NeedParams,
	type NeedsIfOptions,
	type OutcomeView,
	type Planner,
	type PlanRecord,
	type Resolved,
} from "./src/need.ts";
export {
	type AllValues,
	all,
	Blocked,
	Cancelled,
	Failed,
	JobOutcome,
	type JobOutcomeVariants,
	Skipped,
	Succeeded,
} from "./src/outcome/main/mod.ts";
export {
	type JobGraph,
	type PlannedJob,
	type PlannedNeed,
	type PlanOptions,
	planJobs,
} from "./src/plan.ts";
export {
	type JobMisuseCause,
	type Outcomes,
	type RunOptions,
	type RunReport,
	runJobs,
} from "./src/run.ts";
