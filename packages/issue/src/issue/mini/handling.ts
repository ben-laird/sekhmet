/**
 * Handling an issue: `attempt` runs a recovery on it, `handle` gives it a
 * residue directly, and `recoverWith` attempts the issue in a `Result`'s
 * `Err`.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import type { Result } from "@sekhmet/enum/result/mini";
import {
	type Outcome,
	Err as OutcomeErr,
	Ok as OutcomeOk,
	Panicked as OutcomePanicked,
} from "@sekhmet/panic/outcome/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { map, resolved, type Vow } from "@sekhmet/vow/mini";
import {
	AlreadyHandled,
	type Attempt,
	Failed,
	Handled,
	Panicked,
} from "@/src/attempt/mini/core.ts";
import { type Recovery, run } from "@/src/recovery/mini/core.ts";
import { IssueState } from "@/src/state/mini/core.ts";
import type { Issue } from "./core.ts";

/**
 * Switches an unhandled issue to `Handled(residue)` in place, or reports the
 * residue it already held.
 */
function settle<T, R, E>({
	self,
	residue,
}: {
	readonly self: Issue<T, R>;
	readonly residue: R;
}): Attempt<R, E> {
	const params = getStructParams(self);

	return match(params.state)({
		Handled: (existing) => AlreadyHandled<R, E>(existing),
		Unhandled: () => {
			params.state = new IssueState<T, R>("Handled", residue);
			return Handled<R, E>(residue);
		},
	});
}

/**
 * Attempts to handle the issue with a recovery. An unhandled issue runs the
 * recovery on its value; a handled one doesn't run it, and the attempt is
 * `AlreadyHandled` with the residue it holds.
 *
 * When the recovery settles, the state is read again. If the issue was
 * handled meanwhile (by another attempt that finished first), the attempt is
 * `AlreadyHandled` with that residue, whatever this recovery's own result
 * was. Otherwise `Ok` switches the issue to `Handled` in place, and `Err`
 * leaves it unhandled and gives `Failed`.
 *
 * A `Panicked` outcome (a bug in the repair; see `fromPromise`) gives
 * `Panicked(payload)` and leaves the issue unhandled, even if another attempt
 * handled it meanwhile: a bug is never hidden behind `AlreadyHandled`.
 *
 * The vow is resolved at once when the recovery is sync.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @template E The error the recovery fails with
 * @param self The issue to handle
 * @param recovery The repair to run on its value
 * @returns A vow of how the attempt ended
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini";
 * import { attempt, isHandled, issue } from "@sekhmet/issue/issue/mini";
 * import { succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(unionKinds(await wait(attempt(notFound, succeed(8080)))), "Handled");
 * assertEquals(isHandled(notFound), true);
 * ```
 */
export function attempt<T, R, E>(
	self: Issue<T, R>,
	recovery: Recovery<T, R, E>,
): Vow<Attempt<R, E>> {
	return match(getStructParams(self).state)({
		Handled: (existing) => resolved(AlreadyHandled<R, E>(existing)),
		Unhandled: (held) => {
			return map(run(recovery, held), (result) => {
				return match(result)({
					Ok: (residue) => settle<T, R, E>({ self, residue }),
					Err: (error) => {
						return match(getStructParams(self).state)({
							Handled: (existing) => AlreadyHandled<R, E>(existing),
							Unhandled: () => Failed<R, E>(error),
						});
					},
					Panicked: (payload) => Panicked<R, E>(payload),
				});
			});
		},
	});
}

/**
 * Handles the issue directly with `residue`, with no recovery: an unhandled
 * issue switches to `Handled(residue)` in place, and a handled one keeps the
 * residue it holds.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to handle
 * @param residue The residue to handle it with
 * @returns `Handled(residue)`, or `AlreadyHandled` with the residue it held
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini";
 * import { handle, issue, unwrapResidue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(unionKinds(handle(notFound, 8080)), "Handled");
 * assertEquals(unionKinds(handle(notFound, 3000)), "AlreadyHandled");
 * assertEquals(unwrapResidue(notFound), 8080);
 * ```
 */
export function handle<T, R>(self: Issue<T, R>, residue: R): Attempt<R, never> {
	return settle<T, R, never>({ self, residue });
}

/**
 * Attempts the issue in a `Result`'s `Err` with a recovery, settling as an
 * `Outcome`. An `Ok` passes through. An `Err` becomes `Ok(residue)` once its
 * issue is handled, during this attempt or before it; if the recovery
 * fails, the `Err` stays, holding the same, still unhandled issue, and the
 * recovery's error is dropped. If the recovery panics, the outcome is
 * `Panicked(payload)`: the panic resurfaces rather than being swallowed into
 * an `Err`, and the issue stays unhandled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @template E The error the recovery fails with
 * @param result A residue, or the issue that stands in for it
 * @param recovery The repair to run on the issue's value
 * @returns A vow of the residue as `Ok`, the still unhandled issue as `Err`,
 *   or a panic as `Panicked`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, type Result } from "@sekhmet/enum/result/mini";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
 * import { type Issue, issue, recoverWith } from "@sekhmet/issue/issue/mini";
 * import { succeed } from "@sekhmet/issue/recovery/mini";
 * import { wait } from "@sekhmet/vow/mini";
 *
 * const loaded: Result<number, Issue<string, number>> = Err(
 * 	issue({ value: "app.json", code: "config/NotFound", message: "No config file." }),
 * );
 *
 * assertEquals(unwrap(await wait(recoverWith(loaded, succeed(8080)))), 8080);
 * ```
 */
export function recoverWith<T, R, E>(
	result: Result<R, Issue<T, R>>,
	recovery: Recovery<T, R, E>,
): Vow<Outcome<R, Issue<T, R>, unknown>> {
	type Recovered = Outcome<R, Issue<T, R>, unknown>;

	return match(result)({
		Ok: (residue) => resolved<Recovered>(OutcomeOk(residue)),
		Err: (self) => {
			return map(attempt(self, recovery), (ended): Recovered => {
				return match(ended)({
					AlreadyHandled: (residue) => OutcomeOk(residue),
					Handled: (residue) => OutcomeOk(residue),
					Failed: () => OutcomeErr(self),
					Panicked: (payload) => OutcomePanicked(payload),
				});
			});
		},
	});
}
