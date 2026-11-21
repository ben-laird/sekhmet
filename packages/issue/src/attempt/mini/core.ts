/**
 * The {@linkcode Attempt} class and its `AlreadyHandled`, `Handled`,
 * `Failed` and `Panicked` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";

/**
 * The variants of an {@linkcode Attempt}, for type-level work on them.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 */
type Variants<R, E> = Split<{
	AlreadyHandled: [residue: R];
	Handled: [residue: R];
	Failed: [error: E];
	Panicked: [payload: unknown];
}>;

export type { Variants as AttemptVariants };

/**
 * How an attempt to handle an issue ended:
 *
 * - `AlreadyHandled(residue)`: the issue was handled before this attempt,
 *   or by another attempt that finished first; the residue is that one.
 * - `Handled(residue)`: this attempt handled the issue, which switched in
 *   place to hold the residue.
 * - `Failed(error)`: the recovery failed, and the issue stays unhandled.
 * - `Panicked(payload)`: the recovery panicked (a bug, not a failure to
 *   recover), and this attempt didn't handle the issue (another attempt
 *   may have). A `fromPromise` panic is reported to the panic runtime's
 *   hook; a hand-built `Panicked` outcome is not.
 *
 * An attempt is a plain value, so it is covariant in both type parameters.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { type Attempt, Failed } from "@sekhmet/issue/attempt/mini";
 *
 * const attempt: Attempt<number, string> = Failed("offline");
 * const line = match(attempt)({
 * 	AlreadyHandled: (port) => `already on ${port}`,
 * 	Handled: (port) => `now on ${port}`,
 * 	Failed: (error) => `failed: ${error}`,
 * 	Panicked: () => "a bug",
 * });
 *
 * assertEquals(line, "failed: offline");
 * ```
 */
export class Attempt<out R, out E> extends Enum<Variants<R, E>> {}

/**
 * An attempt that found the issue already handled, holding that residue.
 *
 * @template R The residue handling yields
 * @template E The error type of the attempt it stands in for
 * @param residue The residue the issue already held
 * @returns The `AlreadyHandled` attempt
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, isAlreadyHandled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isAlreadyHandled(AlreadyHandled(8080)), true);
 * ```
 */
export function AlreadyHandled<R, E = never>(residue: R): Attempt<R, E> {
	return new Attempt<R, E>("AlreadyHandled", residue);
}

/**
 * An attempt that handled the issue, holding the residue it switched to.
 *
 * @template R The residue handling yields
 * @template E The error type of the attempt it stands in for
 * @param residue The residue the issue now holds
 * @returns The `Handled` attempt
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Handled, isHandled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isHandled(Handled(8080)), true);
 * ```
 */
export function Handled<R, E = never>(residue: R): Attempt<R, E> {
	return new Attempt<R, E>("Handled", residue);
}

/**
 * An attempt whose recovery failed, holding the recovery's error.
 *
 * @template R The residue type of the attempt it stands in for
 * @template E The error the recovery returned
 * @param error The recovery's error
 * @returns The `Failed` attempt
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Attempt, Failed, isFailed } from "@sekhmet/issue/attempt/mini";
 *
 * const attempt: Attempt<number, string> = Failed("offline");
 * assertEquals(isFailed(attempt), true);
 * ```
 */
export function Failed<R = never, E = unknown>(error: E): Attempt<R, E> {
	return new Attempt<R, E>("Failed", error);
}

/**
 * An attempt whose recovery panicked, holding the panic payload. This
 * attempt didn't handle the issue (another attempt may have). A
 * `fromPromise` panic is reported to the panic runtime's hook; a hand-built
 * `Panicked` outcome is not.
 *
 * @template R The residue type of the attempt it stands in for
 * @template E The error type of the attempt it stands in for
 * @param payload What the recovery panicked with
 * @returns The `Panicked` attempt
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isPanicked, Panicked } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isPanicked(Panicked(new Error("bad cache"))), true);
 * ```
 */
export function Panicked<R = never, E = never>(
	payload: unknown,
): Attempt<R, E> {
	return new Attempt<R, E>("Panicked", payload);
}
