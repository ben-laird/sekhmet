/**
 * Testing an attempt: `isAlreadyHandled`, `isHandled`, `isFailed` and
 * `isResolved` (either handled variant), each with an `…And` form that also
 * tests the value it holds.
 *
 * @module
 */

import {
	type Enum,
	type Isolate,
	isolate,
	isolateAnd,
} from "@sekhmet/enum/core/mini";
import type { Attempt, AttemptVariants } from "./core.ts";

/**
 * Checks whether an attempt found the issue already handled.
 *
 * Narrows the variant, so its residue can be read directly, and the error
 * type to `never`.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to check
 * @returns Whether it is `AlreadyHandled`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, Handled, isAlreadyHandled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isAlreadyHandled(AlreadyHandled(1)), true);
 * assertEquals(isAlreadyHandled(Handled(1)), false);
 * ```
 */
export function isAlreadyHandled<R, E>(
	self: Attempt<R, E>,
): self is Enum<Isolate<AttemptVariants<R, E>, "AlreadyHandled">> &
	Attempt<R, never> {
	return isolate(self, "AlreadyHandled");
}

/**
 * Checks whether an attempt found the issue already handled, with a residue
 * that satisfies a predicate (which may be a type guard).
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template U The residue type a type-guard predicate guards
 * @param self The attempt to check
 * @param predicate Tests the residue
 * @returns Whether it is `AlreadyHandled` and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, isAlreadyHandledAnd } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isAlreadyHandledAnd(AlreadyHandled(8080), (port) => port > 1024), true);
 * assertEquals(isAlreadyHandledAnd(AlreadyHandled(80), (port) => port > 1024), false);
 * ```
 */
export function isAlreadyHandledAnd<R, E, U extends R>(
	self: Attempt<R, E>,
	predicate: ((residue: R) => residue is U) | ((residue: R) => boolean),
): self is Enum<Isolate<AttemptVariants<U, E>, "AlreadyHandled">> &
	Attempt<U, never> {
	return isolateAnd(self, "AlreadyHandled", predicate);
}

/**
 * Checks whether this attempt handled the issue.
 *
 * Narrows the variant, so its residue can be read directly, and the error
 * type to `never`.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to check
 * @returns Whether it is `Handled`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, Handled, isHandled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isHandled(Handled(1)), true);
 * assertEquals(isHandled(AlreadyHandled(1)), false);
 * ```
 */
export function isHandled<R, E>(
	self: Attempt<R, E>,
): self is Enum<Isolate<AttemptVariants<R, E>, "Handled">> & Attempt<R, never> {
	return isolate(self, "Handled");
}

/**
 * Checks whether this attempt handled the issue with a residue that
 * satisfies a predicate (which may be a type guard).
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template U The residue type a type-guard predicate guards
 * @param self The attempt to check
 * @param predicate Tests the residue
 * @returns Whether it is `Handled` and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Handled, isHandledAnd } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isHandledAnd(Handled(8080), (port) => port > 1024), true);
 * ```
 */
export function isHandledAnd<R, E, U extends R>(
	self: Attempt<R, E>,
	predicate: ((residue: R) => residue is U) | ((residue: R) => boolean),
): self is Enum<Isolate<AttemptVariants<U, E>, "Handled">> & Attempt<U, never> {
	return isolateAnd(self, "Handled", predicate);
}

/**
 * Checks whether an attempt's recovery failed.
 *
 * Narrows the variant, so its error can be read directly, and the residue
 * type to `never`.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to check
 * @returns Whether it is `Failed`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failed, Handled, isFailed } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isFailed(Failed("offline")), true);
 * assertEquals(isFailed(Handled(1)), false);
 * ```
 */
export function isFailed<R, E>(
	self: Attempt<R, E>,
): self is Enum<Isolate<AttemptVariants<R, E>, "Failed">> & Attempt<never, E> {
	return isolate(self, "Failed");
}

/**
 * Checks whether an attempt's recovery failed with an error that satisfies a
 * predicate (which may be a type guard).
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template F The error type a type-guard predicate guards
 * @param self The attempt to check
 * @param predicate Tests the error
 * @returns Whether it is `Failed` and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failed, isFailedAnd } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isFailedAnd(Failed("offline"), (e) => e === "offline"), true);
 * ```
 */
export function isFailedAnd<R, E, F extends E>(
	self: Attempt<R, E>,
	predicate: ((error: E) => error is F) | ((error: E) => boolean),
): self is Enum<Isolate<AttemptVariants<R, F>, "Failed">> & Attempt<never, F> {
	return isolateAnd(self, "Failed", predicate);
}

/**
 * Checks whether the issue ended up handled, by this attempt or before it:
 * `Handled` or `AlreadyHandled`.
 *
 * Narrows the variant to those two, so the residue can be read directly, and
 * the error type to `never`.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to check
 * @returns Whether it is `Handled` or `AlreadyHandled`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, Failed, Handled, isResolved } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isResolved(Handled(1)), true);
 * assertEquals(isResolved(AlreadyHandled(1)), true);
 * assertEquals(isResolved(Failed("offline")), false);
 * ```
 */
export function isResolved<R, E>(
	self: Attempt<R, E>,
): self is Enum<Isolate<AttemptVariants<R, E>, "AlreadyHandled" | "Handled">> &
	Attempt<R, never> {
	return isolate(self, "AlreadyHandled") || isolate(self, "Handled");
}

/**
 * Checks whether the issue ended up handled, by this attempt or before it,
 * with a residue that satisfies a predicate (which may be a type guard).
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @template U The residue type a type-guard predicate guards
 * @param self The attempt to check
 * @param predicate Tests the residue
 * @returns Whether it is `Handled` or `AlreadyHandled`, and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { AlreadyHandled, isResolvedAnd } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(isResolvedAnd(AlreadyHandled(8080), (port) => port > 1024), true);
 * ```
 */
export function isResolvedAnd<R, E, U extends R>(
	self: Attempt<R, E>,
	predicate: ((residue: R) => residue is U) | ((residue: R) => boolean),
): self is Enum<Isolate<AttemptVariants<U, E>, "AlreadyHandled" | "Handled">> &
	Attempt<U, never> {
	return (
		isolateAnd(self, "AlreadyHandled", predicate) ||
		isolateAnd(self, "Handled", predicate)
	);
}
