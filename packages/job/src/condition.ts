/**
 * `runIf` conditions, as GitHub Actions' status functions:
 * {@linkcode success} (the default), {@linkcode failure},
 * {@linkcode cancelled} and {@linkcode always}.
 *
 * @module
 */

import type { ConditionKind } from "@/src/need.ts";
import { all, type JobOutcome } from "@/src/outcome/main/mod.ts";

/**
 * The settled needs' outcomes, by job name, in the order the plan declared
 * them. A `needsIf` whose guard was false is absent.
 */
export type NeedOutcomes = { readonly [job: string]: JobOutcome<unknown> };

/**
 * What a condition is tested with, once the job's needs have settled.
 */
export interface ConditionInput {
	/** Whether the run has been cancelled (its signal, or `failFast`) */
	readonly cancelled: boolean;
	/** The settled needs' outcomes, by job name */
	readonly outcomes: NeedOutcomes;
}

/**
 * A built-in `runIf` condition. `kind` decides what `run` receives for each
 * need (see {@linkcode ConditionKind}); `describe` is what a dry run shows.
 *
 * @template K What `run` receives for each need
 */
export interface Condition<K extends ConditionKind> {
	/** What `run` receives for each need */
	readonly kind: K;
	/** The condition, for a dry run (`always()`) */
	readonly describe: string;
	/** Whether `run` is called */
	readonly test: (input: ConditionInput) => boolean;
}

/**
 * The default: every need succeeded (`all` of them is a success), and the
 * run isn't cancelled. When it's false, the job ends with exactly the
 * outcome `all` gives (`Blocked`, `Cancelled` or `Skipped`), or `Cancelled`
 * if the needs succeeded but the run was cancelled.
 *
 * @returns The `success()` condition
 *
 * @example
 * ```ts
 * import { success } from "@sekhmet/job";
 * import { Succeeded } from "@sekhmet/job/outcome";
 * import { assertEquals } from "@std/assert";
 *
 * const outcomes = { build: Succeeded("dist") };
 * assertEquals(success().test({ cancelled: false, outcomes }), true);
 * assertEquals(success().test({ cancelled: true, outcomes }), false);
 * ```
 */
export function success(): Condition<"success"> {
	return {
		kind: "success",
		describe: "success()",
		test: ({ cancelled, outcomes }) => {
			return !cancelled && all(outcomes).isSucceeded();
		},
	};
}

/**
 * Some need is unhealthy: it failed, or was blocked by a failure. For a
 * notifier that runs only when something broke.
 *
 * @returns The `failure()` condition
 *
 * @example
 * ```ts
 * import { failure } from "@sekhmet/job";
 * import { Failed } from "@sekhmet/job/outcome";
 * import { assertEquals } from "@std/assert";
 *
 * const outcomes = { build: Failed(new Error("boom")) };
 * assertEquals(failure().test({ cancelled: false, outcomes }), true);
 * ```
 */
export function failure(): Condition<"any"> {
	return {
		kind: "any",
		describe: "failure()",
		test: ({ outcomes }) => {
			return Object.values(outcomes).some((outcome) => outcome.isUnhealthy());
		},
	};
}

/**
 * The run was cancelled, by its signal or `failFast`.
 *
 * @returns The `cancelled()` condition
 *
 * @example
 * ```ts
 * import { cancelled } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(cancelled().test({ cancelled: true, outcomes: {} }), true);
 * ```
 */
export function cancelled(): Condition<"any"> {
	return {
		kind: "any",
		describe: "cancelled()",
		test: ({ cancelled }) => cancelled,
	};
}

/**
 * Run whatever happened, even after a cancel (`t.signal` is then already
 * aborted). For cleanups.
 *
 * @returns The `always()` condition
 *
 * @example
 * ```ts
 * import { always } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(always().test({ cancelled: true, outcomes: {} }), true);
 * ```
 */
export function always(): Condition<"any"> {
	return { kind: "any", describe: "always()", test: () => true };
}
