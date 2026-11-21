/**
 * `fromPromise`: a recovery from a promise-returning repair, with
 * `@sekhmet/vow`'s `fromPromise` contract, except that a `Panic` rejection
 * is reported to the panic hook and settles as `Panicked`, not as an `Err`.
 *
 * @module
 */

import { Panic } from "@sekhmet/panic/mini/core";
import type { PanicRuntime } from "@sekhmet/panic/mini/runtime";
import { Err, Ok, type Outcome } from "@sekhmet/panic/outcome/mini";
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
 * already reported it), and the vow settles with that boundary's
 * `Panicked(payload)`. Every combinator stops at it, and an attempt it runs
 * in settles as `Panicked`, leaving its issue unhandled. Nothing rejects, so
 * no unhandled rejection follows, unless the hook itself throws (see
 * `@sekhmet/vow`'s `fromPromise`).
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
 * @returns A recovery that yields the fulfilled residue, fails with the
 *   rejection reason, or settles as `Panicked` after a panic
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
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
 * import { assertEquals, assertInstanceOf } from "@std/assert";
 * import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
 * import { unwrapPanicked } from "@sekhmet/panic/outcome/mini";
 * import { fromPromise, run } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const panics = definePanicRuntime();
 * const reported: unknown[] = [];
 * panics.setHook(({ payload }) => reported.push(payload));
 * const fetchRemote = fromPromise({
 * 	repair: async (_: string): Promise<number> => panic({ message: "bad cache", cause: null }),
 * 	panics,
 * });
 *
 * const payload = unwrapPanicked(await wait(run(fetchRemote, "app.json")));
 *
 * assertInstanceOf(payload, Panic); // settled as Panicked, not as an Err
 * assertEquals(reported, [payload]); // and reported once
 * ```
 */
export function fromPromise<T, R>(
	options: FromPromiseOptions<T, R>,
): Recovery<T, R, unknown> {
	const { repair, panics } = options;

	return new Recovery<T, R, unknown>((value) => {
		return new Vow<Outcome<R, unknown, unknown>>((resolve) => {
			const settle = (outcome: Outcome<R, unknown, unknown>): void => {
				panics.catchUnwind(() => resolve(outcome));
			};

			repair(value).then(
				(residue) => settle(Ok(residue)),
				(reason: unknown) => {
					if (!(reason instanceof Panic)) {
						settle(Err(reason));
						return;
					}
					// A panic unwinds to this boundary, the top of the task: it
					// reports the payload and gives the Panicked outcome
					const unwound = panics.catchUnwind((): never => {
						throw reason;
					});
					settle(unwound);
				},
			);
		});
	});
}
