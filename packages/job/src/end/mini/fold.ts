/**
 * The precedence `all` folds outcomes by, over an ordered list. Not part of
 * the mini barrel: `all` and the runner share it, and the runner needs the
 * list form, since a record puts integer-like keys first and would reorder
 * the needs `Blocked` names.
 *
 * @module
 */

import { Blocked, Cancelled, type JobEnd, Skipped } from "./core.ts";
import { isCancelled, isSkipped, isUnhealthy } from "./predicates.ts";

/**
 * A named {@linkcode JobEnd}, in an ordered list.
 */
export interface NamedEnd {
	/** The outcome's name (a need's job name, or a record key) */
	readonly name: string;
	/** The outcome */
	readonly outcome: JobEnd<unknown>;
}

/**
 * The outcome that stops a fold of `outcomes` from succeeding, in order of
 * precedence:
 *
 * 1. any unhealthy (`Failed` or `Blocked`): `Blocked`, naming each such
 *    name once, in list order;
 * 2. any `Cancelled`: `Cancelled`;
 * 3. any `Skipped`: `Skipped`;
 * 4. otherwise every one succeeded: `undefined`.
 *
 * @param outcomes The named outcomes, in order
 * @returns The outcome they force, or `undefined` if all succeeded
 */
export function unmet(
	outcomes: readonly NamedEnd[],
): JobEnd<never> | undefined {
	const unhealthy = outcomes.filter(({ outcome }) => isUnhealthy(outcome));
	if (unhealthy.length > 0) {
		return Blocked([...new Set(unhealthy.map(({ name }) => name))]);
	}
	if (outcomes.some(({ outcome }) => isCancelled(outcome))) return Cancelled();
	if (outcomes.some(({ outcome }) => isSkipped(outcome))) return Skipped();
	return undefined;
}
