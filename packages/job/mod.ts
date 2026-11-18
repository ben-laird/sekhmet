/**
 * `@sekhmet/job` (prototype, unpublished): named jobs run as a dependency
 * graph, in the style of GitHub Actions and other CI runners, on the
 * language's own promises and `AbortSignal`.
 *
 * - {@linkcode JobOutcome}: how a job ended in one run.
 * - {@linkcode JobEvent}: what a run reports as it goes.
 * - {@linkcode GraphError}: why a set of jobs is not a graph that can run.
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
	Blocked,
	Cancelled,
	Failed,
	JobOutcome,
	type JobOutcomeVariants,
	Skipped,
	Succeeded,
} from "./src/outcome.ts";
