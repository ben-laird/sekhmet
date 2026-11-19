/**
 * {@linkcode all}: folds a record of outcomes into one, as `Promise.all`
 * folds promises.
 *
 * @module
 */

import { union } from "@sekhmet/enum/core/mini";
import { type JobOutcome, Succeeded } from "./core.ts";
import { unmet } from "./fold.ts";

/**
 * The succeeded values of a record of outcomes, keyed the same.
 *
 * @template R The record of outcomes
 */
export type AllValues<R> = {
	readonly [K in keyof R]: R[K] extends JobOutcome<infer T> ? T : never;
};

/**
 * Folds a record of outcomes into one, as `Promise.all` folds promises. It
 * is the default `runIf`, `success()`: a job whose needs aren't all
 * succeeded ends with exactly the outcome `all` gives.
 *
 * In order of precedence:
 *
 * 1. any unhealthy (`Failed` or `Blocked`): `Blocked`, naming those keys in
 *    order;
 * 2. any `Cancelled`: `Cancelled`;
 * 3. any `Skipped`: `Skipped`;
 * 4. otherwise every one succeeded: `Succeeded` with their values, keyed the
 *    same. An empty record succeeds, as `Promise.all([])` does.
 *
 * @template R The record of outcomes
 * @param outcomes The outcomes, by name
 * @returns The combined outcome
 *
 * @example
 * ```ts
 * import { all, Blocked, Failed, Succeeded } from "@sekhmet/job/outcome/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(
 * 	all({ version: Succeeded("1.2.0"), build: Succeeded("dist") }),
 * 	Succeeded({ version: "1.2.0", build: "dist" }),
 * );
 * assertEquals(
 * 	all({ lint: Failed(new Error("lint")), build: Succeeded("dist") }),
 * 	Blocked(["lint"]),
 * );
 * ```
 */
export function all<R extends Readonly<Record<string, JobOutcome<unknown>>>>(
	outcomes: R,
): JobOutcome<AllValues<R>> {
	const entries = Object.entries(outcomes);
	const forced = unmet(entries.map(([name, outcome]) => ({ name, outcome })));
	if (forced !== undefined) return forced;

	const values = entries.map(([name, outcome]) => [name, union(outcome)]);
	return Succeeded(allValuesUnsafely<R>(Object.fromEntries(values)));
}

/**
 * A cast: a record built key by key can't be typed as a mapped type over a
 * generic `R`. Every entry of `outcomes` succeeded by the time `all` calls
 * this, so each key holds exactly the value `AllValues<R>` gives it.
 */
function allValuesUnsafely<R>(values: Record<string, unknown>): AllValues<R> {
	return values as AllValues<R>;
}
