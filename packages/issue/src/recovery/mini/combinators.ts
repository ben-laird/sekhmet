/**
 * Composing recoveries: `orElse` tries another on failure, `firstOf` tries a
 * list in order, `retry` runs one again, and `when` runs one only for the
 * values a test accepts.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { panic } from "@sekhmet/panic/mini/core";
import { andThen, resolved, type Vow } from "@sekhmet/vow/mini";
import { Recovery, run } from "./core.ts";

/**
 * Tries `self`; if it fails, tries `next` on the same value instead. `self`'s
 * error is dropped, like Rust's `Result::or_else`, so the composite fails
 * with `next`'s error. `next` never runs when `self` succeeds.
 *
 * @template T The value of the issues they repair
 * @template R The residue they yield
 * @template E The error `self` fails with, which is dropped
 * @template F The error `next` fails with
 * @param self The recovery to try first
 * @param next The recovery to try when `self` fails
 * @returns A recovery that yields the first residue, or fails with `next`'s error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { fail, orElse, type Recovery, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const readBackup: Recovery<string, number, string> = fail("`app.bak` can't be read.");
 * const useDefault: Recovery<string, number, never> = succeed(8080);
 *
 * assertEquals(unwrap(await wait(run(orElse(readBackup, useDefault), "app.json"))), 8080);
 * ```
 */
export function orElse<T, R, E, F>(
	self: Recovery<T, R, E>,
	next: Recovery<T, R, F>,
): Recovery<T, R, F> {
	return new Recovery<T, R, F>((value) => {
		return andThen(run(self, value), (result) => {
			return match(result)({
				Ok: (residue) => resolved(Ok<R, F>(residue)),
				Err: () => run(next, value),
			});
		});
	});
}

/**
 * Tries each recovery in order, on the same value, until one succeeds: the
 * fold of {@linkcode orElse}. When all fail, it fails with the last one's
 * error. The list can't be empty: `firstOf([])` doesn't type-check, since
 * with no recovery to try there would be no error to fail with.
 *
 * @template T The value of the issues they repair
 * @template R The residue they yield
 * @template E The error they fail with
 * @param recoveries The recoveries to try, in order (at least one)
 * @returns A recovery that yields the first residue, or fails with the last error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { fail, firstOf, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const recovery = firstOf([
 * 	fail<string, string>("no backup"),
 * 	fail<string, string>("no remote"),
 * 	succeed<string, number>(8080),
 * ]);
 *
 * assertEquals(unwrap(await wait(run(recovery, "app.json"))), 8080);
 * ```
 */
export function firstOf<T, R, E>(
	recoveries: readonly [Recovery<T, R, E>, ...Recovery<T, R, E>[]],
): Recovery<T, R, E> {
	const [first, ...rest] = recoveries;

	return rest.reduce((tried, next) => orElse(tried, next), first);
}

/**
 * What {@linkcode retry} takes: how many more times to run the recovery.
 */
export interface RetryOptions {
	/**
	 * How many times to run the recovery again after it fails: a
	 * non-negative integer, so it runs at most `times + 1` times in all.
	 */
	readonly times: number;
}

/**
 * Runs `self`, and runs it again on the same value each time it fails, up
 * to `times` more times. It succeeds with the first residue, or fails with
 * the last error. Each run starts once the previous one has settled.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error it fails with
 * @param self The recovery to run
 * @param options How many more times to run it after a failure
 * @returns A recovery that yields the first residue, or fails with the last error
 * @throws {Panic} If `times` is not a non-negative integer
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { retry, run, sync } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * let calls = 0;
 * const flaky = sync((_: string) => {
 * 	calls += 1;
 * 	return calls < 3 ? Err(`try ${calls}`) : Ok(calls);
 * });
 *
 * assertEquals(unwrap(await wait(run(retry(flaky, { times: 5 }), "app.json"))), 3);
 * ```
 */
export function retry<T, R, E>(
	self: Recovery<T, R, E>,
	options: RetryOptions,
): Recovery<T, R, E> {
	const { times } = options;

	if (!Number.isInteger(times) || times < 0) {
		return panic({
			name: "InvalidRetryTimes",
			message: `retry's times must be a non-negative integer, got ${times}`,
			cause: times,
		});
	}

	const attempt = (value: T, left: number): Vow<Result<R, E>> => {
		return andThen(run(self, value), (result) => {
			return match(result)({
				Ok: (residue) => resolved(Ok<R, E>(residue)),
				Err: (error) => {
					if (left === 0) return resolved(Err<R, E>(error));

					return attempt(value, left - 1);
				},
			});
		});
	};

	return new Recovery<T, R, E>((value) => attempt(value, times));
}

/**
 * What {@linkcode when} takes: the test a value must pass, and the error for
 * one that doesn't.
 *
 * @template T The value of the issues it repairs
 * @template F The error for a value the test rejects
 */
export interface WhenOptions<T, F> {
	/** Whether the recovery applies to this value */
	readonly test: (value: T) => boolean;
	/** The error the recovery fails with when `test` rejects the value */
	readonly otherwise: F;
}

/**
 * Runs `self` only for values that pass `test`; for any other value, fails
 * with `otherwise` at once, without running `self`.
 *
 * @template T The value of the issues it repairs
 * @template R The residue it yields
 * @template E The error `self` fails with
 * @template F The error for a value the test rejects
 * @param self The recovery to guard
 * @param options The test, and the error for a value it rejects
 * @returns A recovery that runs `self` only for values that pass the test
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { type Recovery, run, succeed, when } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const useDevPort: Recovery<string, number, never> = succeed(3000);
 * const devDefault = when(useDevPort, {
 * 	test: (path) => path.startsWith("dev"),
 * 	otherwise: "not a dev config",
 * });
 *
 * assertEquals(unwrap(await wait(run(devDefault, "dev.json"))), 3000);
 * assertEquals(unwrapErr(await wait(run(devDefault, "app.json"))), "not a dev config");
 * ```
 */
export function when<T, R, E, F>(
	self: Recovery<T, R, E>,
	options: WhenOptions<T, F>,
): Recovery<T, R, E | F> {
	const { test, otherwise } = options;

	return new Recovery<T, R, E | F>((value) => {
		if (test(value)) return run(self, value);

		return resolved(Err<R, E | F>(otherwise));
	});
}
