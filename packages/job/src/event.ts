/**
 * {@linkcode JobEvent}: what a run reports to its `onEvent` hook.
 *
 * @module
 */

import { Enum } from "@sekhmet/enum/core/mini";
import type { JobOutcome } from "@/src/outcome.ts";

/**
 * The variants of a {@linkcode JobEvent}, for type-level work on them.
 */
type Variants =
	| [kind: "Started", started: { readonly job: string }]
	| [kind: "StepStarted", step: { readonly job: string; readonly step: string }]
	| [
			kind: "StepSucceeded",
			step: { readonly job: string; readonly step: string },
	  ]
	| [
			kind: "StepFailed",
			step: {
				readonly job: string;
				readonly step: string;
				readonly error: unknown;
			},
	  ]
	| [
			kind: "Finished",
			finished: { readonly job: string; readonly outcome: JobOutcome<unknown> },
	  ]
	| [kind: "Skipped", skipped: { readonly job: string }]
	| [
			kind: "Blocked",
			blocked: { readonly job: string; readonly blockedBy: readonly string[] },
	  ]
	| [kind: "Cancelled", cancelled: { readonly job: string }];

export type { Variants as JobEventVariants };

/**
 * One thing that happened in a run, passed to `runJobs`'s `onEvent`.
 *
 * Every job ends with exactly one of `Finished`, `Skipped`, `Blocked` or
 * `Cancelled`, after the terminal event of every job it needs.
 *
 * - `Started`: the body is about to run.
 * - `StepStarted`, then `StepSucceeded` or `StepFailed` (with what it threw):
 *   a `t.step` began and ended, between the job's `Started` and its terminal
 *   event.
 * - `Finished`: the body ended (`Succeeded` or `Failed`), or the plan threw
 *   (`Failed`, with no `Started` before it).
 * - `Skipped`, `Blocked`: decided before the body, so no `Started`.
 * - `Cancelled`: stopped before the body started, or while it ran.
 */
export class JobEvent extends Enum<Variants> {}
