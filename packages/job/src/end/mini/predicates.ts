/**
 * Testing an outcome: one predicate per variant, and two complementary
 * pairs of groups.
 *
 * - `isPassing` (Succeeded, Skipped) / `isFailing` (Failed, Blocked,
 *   Cancelled): does it sink the run's verdict?
 * - `isHealthy` (Succeeded, Skipped, Cancelled) / `isUnhealthy` (Failed,
 *   Blocked): did something break?
 *
 * Cancelled is healthy but failing: nothing broke, but the run stopped.
 * Every predicate is a type guard, shaped like Result's `isOk`.
 *
 * @module
 */

import {
	type Enum,
	type Isolate,
	isolate,
	isolateAnd,
} from "@sekhmet/enum/core/mini";
import type { JobEnd, JobEndVariants } from "./core.ts";

/**
 * Whether the job succeeded.
 *
 * Narrows the variant, so its value can be read with `union`, and keeps the
 * outcome a `JobEnd<T>`.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Succeeded`
 *
 * @example
 * ```ts
 * import { union } from "@sekhmet/enum/core/mini";
 * import { isSucceeded, type JobEnd, Succeeded } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const outcome: JobEnd<string> = Succeeded("dist");
 * if (isSucceeded(outcome)) {
 * 	const value: string = union(outcome);
 * 	assertEquals(value, "dist");
 * }
 * ```
 */
export function isSucceeded<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Succeeded">> & JobEnd<T> {
	return isolate(self, "Succeeded");
}

/**
 * Whether the job succeeded with a value that satisfies `predicate`.
 *
 * Narrows the variant and, for a type-guard predicate, the value: the
 * outcome becomes a succeeded `JobEnd<U>`.
 *
 * @template T What a succeeded job returned
 * @template U The narrowed value type, for a type-guard predicate
 * @param self The outcome to check
 * @param predicate Tests the value (may be a type guard)
 * @returns `true` for a `Succeeded` whose value satisfies `predicate`
 *
 * @example
 * ```ts
 * import { isSucceededAnd, Succeeded } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isSucceededAnd(Succeeded(2), (n) => n > 1), true);
 * assertEquals(isSucceededAnd(Succeeded(0), (n) => n > 1), false);
 * ```
 */
export function isSucceededAnd<T, U extends T>(
	self: JobEnd<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Enum<Isolate<JobEndVariants<U>, "Succeeded">> & JobEnd<U> {
	return isolateAnd(self, "Succeeded", predicate);
}

/**
 * Whether the job's body threw.
 *
 * Narrows the variant, so the error can be read with `union`, and makes the
 * outcome a `JobEnd<never>`, which fits an outcome of any type.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Failed`
 *
 * @example
 * ```ts
 * import { Failed, isFailed } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isFailed(Failed(new Error("boom"))), true);
 * ```
 */
export function isFailed<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Failed">> & JobEnd<never> {
	return isolate(self, "Failed");
}

/**
 * Whether the job was skipped.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Skipped`
 *
 * @example
 * ```ts
 * import { isSkipped, Skipped } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isSkipped(Skipped()), true);
 * ```
 */
export function isSkipped<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Skipped">> & JobEnd<never> {
	return isolate(self, "Skipped");
}

/**
 * Whether the job never started because a need failed or was blocked.
 *
 * Narrows the variant, so the blocking needs can be read with `union`.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Blocked`
 *
 * @example
 * ```ts
 * import { Blocked, isBlocked } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isBlocked(Blocked(["build"])), true);
 * ```
 */
export function isBlocked<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Blocked">> & JobEnd<never> {
	return isolate(self, "Blocked");
}

/**
 * Whether the run stopped the job.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Cancelled`
 *
 * @example
 * ```ts
 * import { Cancelled, isCancelled } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isCancelled(Cancelled()), true);
 * ```
 */
export function isCancelled<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Cancelled">> & JobEnd<never> {
	return isolate(self, "Cancelled");
}

/**
 * Whether nothing went wrong: the job succeeded, or was skipped on purpose.
 * The complement of {@linkcode isFailing}.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Succeeded` and `Skipped`
 *
 * @example
 * ```ts
 * import { Cancelled, isPassing, Skipped } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isPassing(Skipped()), true);
 * assertEquals(isPassing(Cancelled()), false);
 * ```
 */
export function isPassing<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Succeeded" | "Skipped">> &
	JobEnd<T> {
	return isolate(self, "Succeeded") || isolate(self, "Skipped");
}

/**
 * Whether the job sinks the run's verdict: it failed, was blocked, or was
 * cancelled. The complement of {@linkcode isPassing}.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Failed`, `Blocked` and `Cancelled`
 *
 * @example
 * ```ts
 * import { Cancelled, isFailing, Succeeded } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isFailing(Cancelled()), true);
 * assertEquals(isFailing(Succeeded(1)), false);
 * ```
 */
export function isFailing<T>(
	self: JobEnd<T>,
): self is Enum<
	Isolate<JobEndVariants<T>, "Failed" | "Blocked" | "Cancelled">
> &
	JobEnd<never> {
	return !isPassing(self);
}

/**
 * Whether nothing broke: the job succeeded, was skipped, or was cancelled.
 * The complement of {@linkcode isUnhealthy}.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Succeeded`, `Skipped` and `Cancelled`
 *
 * @example
 * ```ts
 * import { Blocked, Cancelled, isHealthy } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isHealthy(Cancelled()), true);
 * assertEquals(isHealthy(Blocked(["lint"])), false);
 * ```
 */
export function isHealthy<T>(
	self: JobEnd<T>,
): self is Enum<
	Isolate<JobEndVariants<T>, "Succeeded" | "Skipped" | "Cancelled">
> &
	JobEnd<T> {
	return !isUnhealthy(self);
}

/**
 * Whether something went wrong here or upstream: the job failed, or was
 * blocked by a failure. The complement of {@linkcode isHealthy}; it is what
 * the `failure()` condition asks of each need.
 *
 * @template T What a succeeded job returned
 * @param self The outcome to check
 * @returns `true` for `Failed` and `Blocked`
 *
 * @example
 * ```ts
 * import { Cancelled, Failed, isUnhealthy } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isUnhealthy(Failed(new Error("boom"))), true);
 * assertEquals(isUnhealthy(Cancelled()), false);
 * ```
 */
export function isUnhealthy<T>(
	self: JobEnd<T>,
): self is Enum<Isolate<JobEndVariants<T>, "Failed" | "Blocked">> &
	JobEnd<never> {
	return isolate(self, "Failed") || isolate(self, "Blocked");
}
