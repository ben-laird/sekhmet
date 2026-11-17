/**
 * Building a promised `Result` from a `Promise`-style executor:
 * `promiseResult`.
 *
 * @module
 */

import { Err, Ok, type Result } from "./core.ts";

/**
 * Builds a `Promise<Result>` from an executor shaped like the `Promise`
 * constructor's: calling `resolve(value)` settles it with `Ok(value)`, and
 * `reject(error)` with `Err(error)`. The promise itself never rejects for
 * either.
 *
 * The executor takes `resolve` and `reject` positionally, not as one object:
 * a deliberate exception to the named-arguments rule, so that it reads
 * exactly like `new Promise((resolve, reject) => …)`.
 *
 * As with `new Promise`, the first call wins and later ones are ignored. A
 * throw from the executor is not an `E`, so it is not captured: it rejects
 * the returned promise, as a panic, unless the executor already settled it.
 *
 * @template T - The success value type
 * @template E - The error type
 * @param executor - Runs at once with `resolve` and `reject`
 * @returns A promise of `Ok` for a resolve or `Err` for a reject
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, promiseResult } from "@sekhmet/enum/result/mini";
 *
 * const later = (ms: number) => {
 * 	return promiseResult<number, string>((resolve, reject) => {
 * 		if (ms < 0) return reject(`negative delay: ${ms}`);
 * 		setTimeout(() => resolve(ms), ms);
 * 	});
 * };
 *
 * assertEquals(await later(1), Ok(1));
 * assertEquals(await later(-1), Err("negative delay: -1"));
 * ```
 */
export function promiseResult<T, E>(
	executor: (resolve: (value: T) => void, reject: (error: E) => void) => void,
): Promise<Result<T, E>> {
	return new Promise((settle) => {
		executor(
			(value) => settle(Ok(value)),
			(error) => settle(Err(error)),
		);
	});
}
