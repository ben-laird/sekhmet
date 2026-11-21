/**
 * `fromPromise`: a recovery from a promise-returning repair, on
 * `@sekhmet/vow`'s `fromPromise`.
 *
 * @module
 */

import type { PanicRuntime } from "@sekhmet/panic/mini/runtime";
import { fromPromise as vowFromPromise } from "@sekhmet/vow/mini";
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
	 * The panic runtime whose hook reports a dependent that throws when the
	 * recovery's vow resolves (see `fromPromise` in `@sekhmet/vow`)
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
 * The vow resolves inside the promise's `then` callback, under
 * `panics.catchUnwind`, so a dependent that throws is reported to the
 * runtime's hook rather than escaping as an unhandled rejection.
 *
 * `repair` is called as the recovery runs. A synchronous throw from it (not
 * a rejection) is a bug, and propagates to whoever ran the recovery.
 *
 * @template T The value of the issues it repairs
 * @template R The residue the promise fulfils with
 * @param options The repair, and the panic runtime that reports a dependent
 *   that throws
 * @returns A recovery that yields the fulfilled residue, or fails with the
 *   rejection reason
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
 */
export function fromPromise<T, R>(
	options: FromPromiseOptions<T, R>,
): Recovery<T, R, unknown> {
	const { repair, panics } = options;

	return new Recovery<T, R, unknown>((value) => {
		return vowFromPromise({ promise: repair(value), panics });
	});
}
