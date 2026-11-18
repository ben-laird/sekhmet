/**
 * {@linkcode JobOutcome}: how a job ended in one run.
 *
 * @module
 */

import { Enum, isolate, type Split } from "@sekhmet/enum/core/mini";

/**
 * The variants of a {@linkcode JobOutcome}, for type-level work on them.
 *
 * @template T What a succeeded job returned
 */
type Variants<T> = Split<{
	Succeeded: [value: T];
	Failed: [error: unknown];
	Skipped: [];
	Blocked: [blockedBy: readonly string[]];
	Cancelled: [];
}>;

export type { Variants as JobOutcomeVariants };

/**
 * How a job ended in one run. Outcomes are values: a body's throw or
 * rejection becomes `Failed` and is never rethrown.
 *
 * - `Succeeded`: the body returned this value.
 * - `Failed`: the plan or the body threw or rejected with this error.
 * - `Skipped`: the plan returned `skip()`, or a need was skipped.
 * - `Blocked`: a need failed or was blocked, so the body never started; it
 *   names those needs, in the order the plan declared them.
 * - `Cancelled`: the run's signal, `failFast` or a graph error stopped it.
 *
 * @example
 * ```ts
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Blocked, type JobOutcome } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const outcome: JobOutcome<number> = Blocked(["build"]);
 * const line = match(outcome)({
 * 	Succeeded: (value) => `ok: ${value}`,
 * 	Failed: (error) => `failed: ${String(error)}`,
 * 	Skipped: () => "skipped",
 * 	Blocked: (blockedBy) => `blocked by ${blockedBy.join(", ")}`,
 * 	Cancelled: () => "cancelled",
 * });
 * assertEquals(line, "blocked by build");
 * ```
 */
export class JobOutcome<out T> extends Enum<Variants<T>> {}

/**
 * A job whose body returned `value`.
 *
 * @param value What the body returned
 * @returns The `Succeeded` outcome
 */
export function Succeeded<T>(value: T): JobOutcome<T> {
	return new JobOutcome<T>("Succeeded", value);
}

/**
 * A job whose plan or body threw or rejected with `error`.
 *
 * @param error What was thrown or rejected
 * @returns The `Failed` outcome
 */
export function Failed(error: unknown): JobOutcome<never> {
	return new JobOutcome<never>("Failed", error);
}

/**
 * A job its plan skipped, or whose need was skipped.
 *
 * @returns The `Skipped` outcome
 */
export function Skipped(): JobOutcome<never> {
	return new JobOutcome<never>("Skipped");
}

/**
 * A job that never started because the named needs failed or were blocked.
 *
 * @param blockedBy The unhealthy needs, in declaration order
 * @returns The `Blocked` outcome
 */
export function Blocked(blockedBy: readonly string[]): JobOutcome<never> {
	return new JobOutcome<never>("Blocked", blockedBy);
}

/**
 * A job the run stopped: its signal was aborted before or while it ran.
 *
 * @returns The `Cancelled` outcome
 */
export function Cancelled(): JobOutcome<never> {
	return new JobOutcome<never>("Cancelled");
}

/**
 * Whether an outcome blocks the jobs that need it: it `Failed` or was
 * `Blocked`, as `scripts/ci` calls a dependency unhealthy.
 *
 * @param outcome The need's outcome
 * @returns `true` for `Failed` and `Blocked`
 */
export function isUnhealthy(outcome: JobOutcome<unknown>): boolean {
	return isolate(outcome, "Failed") || isolate(outcome, "Blocked");
}
