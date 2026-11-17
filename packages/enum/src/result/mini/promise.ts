/**
 * Building a promised `Result` from a `Promise`-style executor:
 * `promiseResult`.
 *
 * @module
 */

import { Err, Ok, type Result } from "./core.ts";

/**
 * `T`, unless it is a `PromiseLike`, in which case `never`. Used in a
 * callback's return position, it makes a callback that returns a promise
 * (an async function) a compile error where only a plain value makes sense.
 *
 * @template T - The type to check
 */
export type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

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
 * Unlike `new Promise`'s, this `resolve` doesn't adopt a thenable: it would
 * only wrap it in `Ok`, so it takes `NotPromise<T>`, and a `T` that is a
 * `PromiseLike` leaves `resolve` uncallable. Await the value first, then
 * resolve with it.
 *
 * As with `new Promise`, the first call wins and later ones are ignored, and
 * the executor's return value is ignored. A synchronous throw from the
 * executor is not captured: the returned promise rejects with the thrown
 * value, uncaught (it is a bug, not an `E`), unless the executor already
 * settled it.
 *
 * An async executor also behaves as it does with `new Promise`: what it
 * returns is ignored, so a throw after its first `await` rejects a promise
 * nobody handles, and unless it called `resolve` or `reject` first, the
 * returned promise never settles. Keep the executor synchronous, and settle
 * from the callbacks of whatever it starts.
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
	executor: (
		resolve: (value: NotPromise<T>) => void,
		reject: (error: E) => void,
	) => void,
): Promise<Result<T, E>> {
	return new Promise((settle) => {
		executor(
			(value) => settle(Ok(value)),
			(error) => settle(Err(error)),
		);
	});
}
