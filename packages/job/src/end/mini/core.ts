/**
 * The {@linkcode JobEnd} class and its constructors.
 *
 * @module
 */

import { Enum } from "@sekhmet/enum/core/mini";

/**
 * The variants of a {@linkcode JobEnd}, for type-level work on them.
 *
 * @template T What a succeeded job returned
 */
type Variants<T> =
	| [kind: "Succeeded", value: T]
	| [kind: "Failed", error: unknown]
	| [kind: "Skipped"]
	| [kind: "Blocked", blockedBy: readonly string[]]
	| [kind: "Cancelled"];

export type { Variants as JobEndVariants };

/**
 * How a job ended in one run. Outcomes are values: a body's throw or
 * rejection becomes `Failed` and is never rethrown.
 *
 * - `Succeeded`: the body returned this value.
 * - `Failed`: the body threw or rejected with this error.
 * - `Skipped`: its `runIf` was false, or (under the default `success()`) a
 *   need was skipped.
 * - `Blocked`: a need failed or was blocked, so the body never started; it
 *   names those needs, in the order the plan declared them.
 * - `Cancelled`: the run was cancelled (its signal or `failFast`) before or
 *   while the job ran.
 *
 * Match on it with enum's root `match`; there is deliberately no `match` of
 * its own.
 *
 * @template T What a succeeded job returned
 *
 * @example
 * ```ts
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Blocked, type JobEnd } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const outcome: JobEnd<number> = Blocked(["build"]);
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
export class JobEnd<out T> extends Enum<Variants<T>> {}

/**
 * A job whose body returned `value`.
 *
 * @template T What the body returned
 * @param value What the body returned
 * @returns The `Succeeded` outcome
 *
 * @example
 * ```ts
 * import { isSucceeded, Succeeded } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isSucceeded(Succeeded("dist")), true);
 * ```
 */
export function Succeeded<T>(value: T): JobEnd<T> {
	return new JobEnd<T>("Succeeded", value);
}

/**
 * A job whose body threw or rejected with `error`.
 *
 * @template T The success type of the outcome it stands in for
 * @param error What was thrown or rejected
 * @returns The `Failed` outcome
 *
 * @example
 * ```ts
 * import { Failed, isFailed, type JobEnd } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const outcome: JobEnd<number> = Failed<number>(new Error("boom"));
 * assertEquals(isFailed(outcome), true);
 * ```
 */
export function Failed<T = never>(error: unknown): JobEnd<T> {
	return new JobEnd<T>("Failed", error);
}

/**
 * A job whose `runIf` was false, or whose need was skipped.
 *
 * @template T The success type of the outcome it stands in for
 * @returns The `Skipped` outcome
 *
 * @example
 * ```ts
 * import { isSkipped, type JobEnd, Skipped } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const outcome: JobEnd<number> = Skipped<number>();
 * assertEquals(isSkipped(outcome), true);
 * ```
 */
export function Skipped<T = never>(): JobEnd<T> {
	return new JobEnd<T>("Skipped");
}

/**
 * A job that never started because the named needs failed or were blocked.
 *
 * @template T The success type of the outcome it stands in for
 * @param blockedBy The unhealthy needs, in declaration order
 * @returns The `Blocked` outcome
 *
 * @example
 * ```ts
 * import { Blocked, isBlocked } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isBlocked(Blocked(["lint"])), true);
 * ```
 */
export function Blocked<T = never>(blockedBy: readonly string[]): JobEnd<T> {
	return new JobEnd<T>("Blocked", blockedBy);
}

/**
 * A job the run stopped: it was cancelled before or while it ran.
 *
 * @template T The success type of the outcome it stands in for
 * @returns The `Cancelled` outcome
 *
 * @example
 * ```ts
 * import { Cancelled, isCancelled } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isCancelled(Cancelled()), true);
 * ```
 */
export function Cancelled<T = never>(): JobEnd<T> {
	return new JobEnd<T>("Cancelled");
}
