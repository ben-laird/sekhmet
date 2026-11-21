/**
 * `fromPromise`: a recovery from a promise-returning repair, with
 * `@sekhmet/vow`'s `fromPromise` contract, except that a `Panic` rejection
 * is reported to the panic hook rather than carried as an `Err`.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Panic } from "@sekhmet/panic/mini/core";
import type { PanicRuntime } from "@sekhmet/panic/mini/runtime";
import { Vow } from "@sekhmet/vow/mini";
import { Recovery } from "./core.ts";

/**
 * What {@linkcode fromPromise} takes: the promise-returning repair, and the
 * panic runtime that reports a dependent that throws.
 *
 * @template T The value of the issues it repairs
 * @template R The residue the promise fulfils with
 */
export interface FromPromiseOptions<T, R> {
	/** Turns the value into a promise of the residue */
	readonly repair: (value: T) => Promise<R>;
	/**
	 * The panic runtime whose hook reports a `Panic` the promise rejects
	 * with, and a dependent that throws when the recovery's vow resolves (see
	 * `fromPromise` in `@sekhmet/vow`)
	 */
	readonly panics: PanicRuntime;
}

/**
 * A recovery from a promise-returning repair, with `@sekhmet/vow`'s
 * `fromPromise` contract: a promise can fail and a vow cannot, so the
 * failure is carried in the value. Fulfilment with a residue is `Ok`, and a
 * rejection is `Err` with the rejection reason, typed `unknown` as a
 * rejection always is (map it with `mapErr`). The rejection is always
 * handled, so it never surfaces as unhandled.
 *
 * A rejection with a `Panic` is a bug in the repair, not a failure to
 * recover, so it is not an `Err` that `or` or `firstOf` would move past.
 * It unwinds to a boundary of `panics` around the `then` callback, the top
 * of the async task, whose hook reports it (once: not again if this runtime
 * already reported it). Like a panicked task, the recovery never finishes:
 * its vow stays pending for good, so an attempt it runs in never settles
 * and its issue stays unhandled. Nothing rejects, so no unhandled rejection
 * follows.
 *
 * The vow resolves inside the promise's `then` callback, under
 * `panics.catchUnwind`, so a dependent that throws is reported to the
 * runtime's hook rather than escaping as an unhandled rejection.
 *
 * `repair` is called as the recovery runs. A synchronous throw from it (not
 * a rejection) is a bug, and propagates to whoever ran the recovery.
 *
 * @template T The value of the issues it repairs
 * @template R The residue the promise fulfils with
 * @param options The repair, and the panic runtime that reports a panic and
 *   a dependent that throws
 * @returns A recovery that yields the fulfilled residue, or fails with the
 *   rejection reason, and never finishes after a panic
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { fromPromise, run } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const panics = definePanicRuntime();
 * const fetchRemote = fromPromise({
 * 	repair: async (path: string) => {
 * 		if (path === "app.json") return { port: 9000 };
 * 		throw "offline";
 * 	},
 * 	panics,
 * });
 *
 * assertEquals(unwrap(await wait(run(fetchRemote, "app.json"))), { port: 9000 });
 * assertEquals(unwrapErr(await wait(run(fetchRemote, "other.json"))), "offline");
 * ```
 *
 * @example
 * ```ts
 * import { assert, assertInstanceOf } from "@std/assert";
 * import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
 * import { fromPromise, run } from "@sekhmet/issue/recovery/mini";
 * import { isPending } from "@sekhmet/vow/mini";
 *
 * const panics = definePanicRuntime();
 * const reported = new Promise((resolve) => {
 * 	panics.setHook(({ payload }) => resolve(payload));
 * });
 * const fetchRemote = fromPromise({
 * 	repair: async (_: string): Promise<number> => panic({ message: "bad cache", cause: null }),
 * 	panics,
 * });
 *
 * const ran = run(fetchRemote, "app.json");
 *
 * assertInstanceOf(await reported, Panic); // reported, not an Err
 * assert(isPending(ran)); // and the recovery never finishes
 * ```
 */
export function fromPromise<T, R>(
	options: FromPromiseOptions<T, R>,
): Recovery<T, R, unknown> {
	const { repair, panics } = options;

	return new Recovery<T, R, unknown>((value) => {
		return new Vow<Result<R, unknown>>((resolve) => {
			repair(value).then(
				(residue) => {
					panics.catchUnwind(() => resolve(Ok(residue)));
				},
				(reason: unknown) => {
					panics.catchUnwind(() => {
						// A panic unwinds to this boundary, the top of the task
						if (reason instanceof Panic) {
							throw reason;
						}
						resolve(Err(reason));
					});
				},
			);
		});
	});
}
