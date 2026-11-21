/**
 * Composing recoveries: `or` tries another on failure, `orElse` builds the
 * next from the error, `firstOf` tries a list in order, `retry` runs one
 * again, and `when` runs one only for the values a test accepts. As in Rust
 * and `@sekhmet/enum`, `or` takes the next recovery itself and `orElse`
 * makes it lazily from what failed.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini";
import { Err, isOk, Ok, type Result } from "@sekhmet/enum/result/mini";
import { panic } from "@sekhmet/panic/mini/core";
import {
	andThen,
	isResolved,
	map,
	resolved,
	type Vow,
	vowWithResolver,
} from "@sekhmet/vow/mini";
import { Recovery, run } from "./core.ts";

/** What {@linkcode tryInTurn} takes. */
interface TryInTurnOptions<T, R, E> {
	/** The value every recovery runs on */
	readonly value: T;
	/** How many recoveries there are to try (at least one) */
	readonly count: number;
	/** The recovery to try at a position */
	readonly recoveryAt: (index: number) => Recovery<T, R, E>;
}

/**
 * Runs recoveries in turn on one value until one succeeds or the last one
 * fails, with that result. It loops while each run's vow is already
 * resolved, and subscribes only to a pending one, resuming the loop when it
 * settles, so neither a long sync run nor a long async one nests the stack.
 */
function tryInTurn<T, R, E>({
	value,
	count,
	recoveryAt,
}: TryInTurnOptions<T, R, E>): Vow<Result<R, E>> {
	const { vow, resolve } = vowWithResolver<Result<R, E>>();
	const isFinal = ({
		result,
		index,
	}: {
		readonly result: Result<R, E>;
		readonly index: number;
	}): boolean => {
		return isOk(result) || index === count - 1;
	};
	const tryFrom = (start: number): void => {
		for (let index = start; index < count; index += 1) {
			const running = run(recoveryAt(index), value);

			if (!isResolved(running)) {
				map(running, (result) => {
					if (isFinal({ result, index })) {
						resolve(result);
						return;
					}

					tryFrom(index + 1);
				});
				return;
			}

			const result = union(running);
			if (isFinal({ result, index })) {
				resolve(result);
				return;
			}
		}
	};

	tryFrom(0);

	return vow;
}

/**
 * Tries `self`; if it fails, tries `next` on the same value instead. `self`'s
 * error is dropped, like Rust's `Result::or`, so the composite fails with
 * `next`'s error. `next` never runs when `self` succeeds. To build the next
 * recovery from the error, use {@linkcode orElse}.
 *
 * The residue is the wider of the two, with no union: a recovery is
 * covariant in its residue, so a `fail` (residue `never`) followed by a
 * `Recovery<T, Config, F>` is a `Recovery<T, Config, F>`, in either order.
 * Unrelated residues (`number` and `Config`) don't type-check.
 *
 * @template T The value of the issues they repair
 * @template R The residue they yield: the wider of the two
 * @template F The error `next` fails with
 * @param self The recovery to try first; its error is dropped
 * @param next The recovery to try when `self` fails
 * @returns A recovery that yields the first residue, or fails with `next`'s error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { fail, or, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const readBackup = fail<string, string>("`app.bak` can't be read.");
 * const useDefault = succeed<string, number>(8080);
 *
 * assertEquals(unwrap(await wait(run(or(readBackup, useDefault), "app.json"))), 8080);
 * ```
 */
export function or<T, R, F>(
	self: Recovery<T, R, unknown>,
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
 * Tries `self`; if it fails, builds the next recovery from `self`'s error
 * and tries it on the same value, like Rust's `Result::or_else`. The
 * composite fails with that recovery's error, and `next` is never called
 * when `self` succeeds. To try a recovery already at hand, use
 * {@linkcode or}.
 *
 * The residue widens as `or`'s does, with no union: a `fail` (residue
 * `never`) whose `next` builds a `Recovery<T, Config, F>` is a
 * `Recovery<T, Config, F>`, in either order. Unrelated residues (`number`
 * and `Config`) don't type-check.
 *
 * @template T The value of the issues they repair
 * @template R The residue they yield: the wider of the two
 * @template E The error `self` fails with, which `next` receives
 * @template F The error the built recovery fails with
 * @param self The recovery to try first
 * @param next Builds the recovery to try from `self`'s error
 * @returns A recovery that yields the first residue, or fails with the
 *   built recovery's error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { fail, orElse, run, succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const readBackup = fail<string, number>(503);
 * const recovery = orElse(readBackup, (status) => {
 * 	return succeed<string, number>(status === 503 ? 8080 : 80);
 * });
 *
 * assertEquals(unwrap(await wait(run(recovery, "app.json"))), 8080);
 * ```
 */
export function orElse<T, R, E, F>(
	self: Recovery<T, R, E>,
	next: (error: E) => Recovery<T, R, F>,
): Recovery<T, R, F> {
	return new Recovery<T, R, F>((value) => {
		return andThen(run(self, value), (result) => {
			return match(result)({
				Ok: (residue) => resolved(Ok<R, F>(residue)),
				Err: (error) => run(next(error), value),
			});
		});
	});
}

/**
 * Tries each recovery in order, on the same value, until one succeeds: it
 * behaves as {@linkcode or} folded over the list. When all fail, it
 * fails with the last one's error. The list can't be empty: `firstOf([])`
 * doesn't type-check, since with no recovery to try there would be no error
 * to fail with. The recoveries run in a loop that doesn't nest the stack, so
 * a long list is safe, sync or async.
 *
 * @template T The value of the issues they repair
 * @template R The residue they yield: the widest of the list's
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
	const all = [first, ...rest];

	return new Recovery<T, R, E>((value) => {
		return tryInTurn({
			value,
			count: all.length,
			recoveryAt: (index) => {
				return (
					all[index] ??
					panic({
						name: "Unreachable",
						message: `firstOf has no recovery at ${index}`,
						cause: index,
					})
				);
			},
		});
	});
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
 * the last error. Each run starts once the previous one has settled. A sync
 * recovery's runs loop without nesting the stack, so `times` can be large.
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

	return new Recovery<T, R, E>((value) => {
		return tryInTurn({ value, count: times + 1, recoveryAt: () => self });
	});
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
