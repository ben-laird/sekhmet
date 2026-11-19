/**
 * Transforming an outcome: `map`, `toResult` and `catchFailure`.
 *
 * @module
 */

import {
	type Eliminate,
	type Enum,
	eliminate,
	match,
} from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { panicWithoutCause } from "@sekhmet/panic/mini/core";
import {
	Blocked,
	Cancelled,
	Failed,
	type JobOutcome,
	type JobOutcomeVariants,
	Skipped,
	Succeeded,
} from "./core.ts";

/**
 * Maps the value of a success; every other outcome passes through.
 *
 * @template T What a succeeded job returned
 * @template U What `mapping` returns
 * @param self The outcome
 * @param mapping Transforms a success's value
 * @returns The outcome with its value mapped
 *
 * @example
 * ```ts
 * import { map, Skipped, Succeeded } from "@sekhmet/job/outcome/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(map(Succeeded(2), (n) => n * 10), Succeeded(20));
 * assertEquals(map(Skipped<number>(), (n) => n * 10), Skipped());
 * ```
 */
export function map<T, U>(
	self: JobOutcome<T>,
	mapping: (value: T) => U,
): JobOutcome<U> {
	return match(self)<JobOutcome<U>>({
		Succeeded: (value) => Succeeded(mapping(value)),
		Failed: (error) => Failed(error),
		Skipped: () => Skipped(),
		Blocked: (blockedBy) => Blocked(blockedBy),
		Cancelled: () => Cancelled(),
	});
}

/**
 * Hands an outcome to `Result`-speaking code: `Ok` with the value, or `Err`
 * with the outcome that wasn't a success, so the reason survives.
 *
 * @template T What a succeeded job returned
 * @param self The outcome
 * @returns `Ok(value)` for `Succeeded`, else `Err` holding the outcome
 *
 * @example
 * ```ts
 * import { isErr } from "@sekhmet/enum/result/mini";
 * import { Blocked, toResult } from "@sekhmet/job/outcome/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isErr(toResult(Blocked(["build"]))), true);
 * ```
 */
export function toResult<T>(self: JobOutcome<T>): Result<T, JobOutcome<never>> {
	return match(self)<Result<T, JobOutcome<never>>>({
		Succeeded: (value) => Ok(value),
		Failed: (error) => Err(Failed(error)),
		Skipped: () => Err(Skipped()),
		Blocked: (blockedBy) => Err(Blocked(blockedBy)),
		Cancelled: () => Err(Cancelled()),
	});
}

/**
 * Turns a failure into a success holding `Err(error)`, and a success into
 * one holding `Ok(value)`. The other outcomes pass through, and `Failed` is
 * gone from the variants, so enum's `match` on the result takes four arms,
 * with no `Failed`. The result is still a `JobOutcome`, though: `isFailed`
 * on it type-checks and returns `false`, but doesn't narrow it to `never`.
 *
 * @template T What a succeeded job returned
 * @param self The outcome
 * @returns The outcome with its failure caught into the value
 *
 * @example
 * ```ts
 * import { match } from "@sekhmet/enum/core/mini";
 * import { isErr } from "@sekhmet/enum/result/mini";
 * import { catchFailure, Failed } from "@sekhmet/job/outcome/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const line = match(catchFailure(Failed<number>(new Error("boom"))))({
 * 	Succeeded: (result) => (isErr(result) ? "caught" : "ok"),
 * 	Skipped: () => "skipped",
 * 	Blocked: () => "blocked",
 * 	Cancelled: () => "cancelled",
 * });
 * assertEquals(line, "caught");
 * ```
 */
export function catchFailure<T>(
	self: JobOutcome<T>,
): Enum<Eliminate<JobOutcomeVariants<Result<T, unknown>>, "Failed">> &
	JobOutcome<Result<T, unknown>> {
	const caught = match(self)<JobOutcome<Result<T, unknown>>>({
		Succeeded: (value) => Succeeded(Ok(value)),
		Failed: (error) => Succeeded(Err(error)),
		Skipped: () => Skipped(),
		Blocked: (blockedBy) => Blocked(blockedBy),
		Cancelled: () => Cancelled(),
	});
	if (eliminate(caught, "Failed")) return caught;
	return panicWithoutCause({
		name: "Unreachable",
		message: "catchFailure produced a Failed outcome",
	});
}
