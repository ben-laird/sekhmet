/**
 * `invariant`: an assertion function for a condition that holds unless the
 * program is wrong. It narrows like `asserts condition`, and panics when the
 * condition is falsy.
 *
 * @module
 */

import type { Panic } from "@sekhmet/panic/mini/core";
import { WorkflowPanic } from "../workflow-panic/workflow-panic.ts";
import { violated } from "./violation.ts";

/** What {@linkcode invariant} is given besides the condition. */
export interface InvariantOptions {
	/**
	 * What the program should do, phrased as a "should" statement, such as
	 * `"the cart should never be empty at checkout"`
	 */
	readonly expectedBehavior: string;
	/** Where to report the bug, such as the repository's issue tracker */
	readonly issueUrl?: URL;
}

/**
 * Which check broke an invariant, with the value(s) that broke it. `kind`
 * names the check:
 *
 * - `"condition"`: {@linkcode invariant} was given a falsy `condition`.
 */
export type InvariantCheck = {
	readonly kind: "condition";
	/** The falsy condition that broke the invariant */
	readonly condition: unknown;
};

/**
 * The cause of the panic {@linkcode invariant} and the other invariant checks
 * throw. `check` says which check failed and keeps the offending value(s).
 */
export interface InvariantCause {
	/** Which check failed, with the value(s) that failed it */
	readonly check: InvariantCheck;
	/** What the program should have done */
	readonly expectedBehavior: string;
	/** Where to report the bug, if given */
	readonly issueUrl: URL | undefined;
}

/**
 * Asserts that `condition` is truthy, narrowing it like any `asserts`
 * function, and otherwise panics as `Panic (Invariant)`. Use it for a
 * condition that is false only when the program has a bug, never to check
 * input (return a `Result` for that).
 *
 * The condition comes first because `asserts` names a parameter; the rest are
 * named options. The message is built around the expected behavior:
 *
 * ```txt
 * an invariant was violated
 * Expected behavior: the cart should never be empty at checkout
 * Please file an issue at https://example.com/issues
 * ```
 *
 * @param condition The condition that must hold
 * @param options The expected behavior, and an optional issue URL
 * @returns Nothing; it panics when `condition` is falsy
 *
 * @example
 * ```ts
 * import { invariant, isInvariantPanic } from "@sekhmet/workflow/invariant";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * function checkout(cart: readonly string[]): string {
 *   const first = cart[0];
 *   invariant(first !== undefined, {
 *     expectedBehavior: "the cart should never be empty at checkout",
 *   });
 *   return first; // narrowed to string
 * }
 *
 * assertEquals(checkout(["apple"]), "apple");
 *
 * const thrown = assertThrows(() => checkout([]));
 * assert(isInvariantPanic(thrown));
 * assertEquals(
 *   thrown.message,
 *   "an invariant was violated\n" +
 *     "Expected behavior: the cart should never be empty at checkout",
 * );
 * ```
 */
export function invariant(
	condition: unknown,
	options: InvariantOptions,
): asserts condition {
	if (condition) {
		return;
	}
	violated({ check: { kind: "condition", condition }, options });
}

/**
 * Whether `value` is the panic {@linkcode invariant} (or another invariant
 * check) throws. It runs no Proxy trap, and a `Panic` built by hand with the
 * same name is not one.
 *
 * @param value Any caught value
 * @returns True if an invariant check threw `value`, narrowing it to
 *   `Panic<InvariantCause>`
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { invariant, isInvariantPanic } from "@sekhmet/workflow/invariant";
 * import { assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * const broken: string[] = [];
 * runtime.setHook(({ payload }) => {
 *   if (isInvariantPanic(payload)) broken.push(payload.cause.expectedBehavior);
 * });
 *
 * runtime.catchUnwind(() => {
 *   invariant(1 > 2, { expectedBehavior: "one should exceed two" });
 * });
 *
 * assertEquals(broken, ["one should exceed two"]);
 * ```
 */
export function isInvariantPanic(
	value: unknown,
): value is Panic<InvariantCause> {
	return WorkflowPanic.kindOf(value) === "Invariant";
}
