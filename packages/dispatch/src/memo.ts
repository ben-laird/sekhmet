/**
 * A memo that runs its computation once and is poisoned if it throws, like
 * Rust's `LazyLock`. Private to the package: `map` uses it so its mapping
 * runs once however many readers it has.
 *
 * @module
 */

import { Enum, match, type Split } from "@sekhmet/enum/core/mini";
import { panic } from "@sekhmet/panic";

/** Where a memo stands: not yet computed, computed, or poisoned by a throw. */
type MemoVariants<T> = Split<{
	Unset: [];
	Value: [value: T];
	Poisoned: [payload: unknown];
}>;

/** A memo's state, as an enum so the poisoned case is explicit. */
class Memo<out T> extends Enum<MemoVariants<T>> {}

/** The message of the panic a read of a poisoned memo throws. */
export const POISONED_MESSAGE =
	"map's mapping panicked earlier; this signal is poisoned";

/**
 * Wraps `compute` so it runs once, on the first call. Later calls return its
 * value without running it again. If it throws, the throw propagates to
 * that first caller, and every later call panics with a poison panic whose
 * cause is the original payload.
 *
 * @param compute The computation to run once
 * @returns A function that runs `compute` on its first call and remembers
 *   the outcome
 */
export function once<A, U>(compute: (input: A) => U): (input: A) => U {
	let memo: Memo<U> = new Memo<U>("Unset");
	return (input) => {
		return match(memo)({
			Unset: () => {
				try {
					const value = compute(input);
					memo = new Memo<U>("Value", value);
					return value;
				} catch (payload: unknown) {
					memo = new Memo<U>("Poisoned", payload);
					throw payload;
				}
			},
			Value: (value) => value,
			Poisoned: (payload) => {
				return panic({
					name: "Poisoned",
					message: POISONED_MESSAGE,
					cause: payload,
				});
			},
		});
	};
}
