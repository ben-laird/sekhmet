/**
 * Testing an outcome: `isOk`, `isOkAnd`, `isErr`, `isErrAnd`, `isPanicked`
 * and `isPanicAnd`.
 *
 * @module
 */

import type { Enum, Isolate } from "@sekhmet/enum/core/mini/core";
import { isolate, isolateAnd } from "@sekhmet/enum/core/mini/isolate";
import type { Outcome, OutcomeVariants } from "./core.ts";

/**
 * Checks if an Outcome is in the Ok variant.
 *
 * Narrows both the variant and the type parameters: the Outcome becomes its
 * Ok variant, so its value can be read directly, and an
 * `Outcome<T, never, never>`, which fits an Outcome with any error and
 * payload types.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to check
 * @returns true if the Outcome is Ok, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Err, Ok, type Outcome, Panicked, isOk } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(isOk(Ok(42)), true);
 * assertEquals(isOk(Err("failed")), false);
 * assertEquals(isOk(Panicked("boom")), false);
 *
 * const outcome: Outcome<number, string> = Ok(42);
 * if (isOk(outcome)) {
 *   const value: number = union(outcome); // the variant: outcome is Ok
 *   const other: Outcome<number, Error, never> = outcome; // an Outcome<number, never, never>
 *   assertEquals(value, 42);
 *   assertEquals(other, outcome);
 * }
 * ```
 */
export function isOk<T, E, P>(
	self: Outcome<T, E, P>,
): self is Enum<Isolate<OutcomeVariants<T, E, P>, "Ok">> &
	Outcome<T, never, never> {
	return isolate(self, "Ok");
}

/**
 * Checks if an Outcome is Ok and its value satisfies a predicate.
 *
 * A type guard that narrows both the variant and the type parameters: the
 * Outcome becomes its Ok variant and an `Outcome<U, never, never>`, where `U`
 * is the type a type-guard predicate guards (or `T` for a boolean predicate).
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template U The narrowed type when the predicate is a type guard
 * @param self The Outcome to check
 * @param predicate A function that tests the Ok value (may be a type guard)
 * @returns true if the Outcome is Ok and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, Panicked, isOkAnd } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(isOkAnd(Ok(42), (n) => n > 40), true);
 * assertEquals(isOkAnd(Ok(7), (n) => n > 40), false);
 * assertEquals(isOkAnd(Panicked<number>("boom"), (n) => n > 40), false);
 * ```
 */
export function isOkAnd<T, E, P, U extends T>(
	self: Outcome<T, E, P>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Enum<Isolate<OutcomeVariants<U, E, P>, "Ok">> &
	Outcome<U, never, never> {
	return isolateAnd(self, "Ok", predicate);
}

/**
 * Checks if an Outcome is in the Err variant: an expected error, not a
 * panic.
 *
 * Narrows both the variant and the type parameters: the Outcome becomes its
 * Err variant, so its error can be read directly, and an
 * `Outcome<never, E, never>`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to check
 * @returns true if the Outcome is Err, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, Panicked, isErr } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(isErr(Err("failed")), true);
 * assertEquals(isErr(Ok(42)), false);
 * assertEquals(isErr(Panicked("boom")), false);
 * ```
 */
export function isErr<T, E, P>(
	self: Outcome<T, E, P>,
): self is Enum<Isolate<OutcomeVariants<T, E, P>, "Err">> &
	Outcome<never, E, never> {
	return isolate(self, "Err");
}

/**
 * Checks if an Outcome is Err and its error satisfies a predicate.
 *
 * A type guard that narrows both the variant and the type parameters: the
 * Outcome becomes its Err variant and an `Outcome<never, F, never>`, where
 * `F` is the type a type-guard predicate guards (or `E` for a boolean
 * predicate).
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template F The narrowed error type when the predicate is a type guard
 * @param self The Outcome to check
 * @param predicate A function that tests the error (may be a type guard)
 * @returns true if the Outcome is Err and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, isErrAnd } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(isErrAnd(Err("not found"), (e) => e.startsWith("not")), true);
 * assertEquals(isErrAnd(Err("timeout"), (e) => e.startsWith("not")), false);
 * ```
 */
export function isErrAnd<T, E, P, F extends E>(
	self: Outcome<T, E, P>,
	predicate: ((error: E) => error is F) | ((error: E) => boolean),
): self is Enum<Isolate<OutcomeVariants<T, F, P>, "Err">> &
	Outcome<never, F, never> {
	return isolateAnd(self, "Err", predicate);
}

/**
 * Checks if an Outcome is in the Panicked variant: the work threw.
 *
 * Narrows both the variant and the type parameters: the Outcome becomes its
 * Panicked variant, so its payload can be read directly, and an
 * `Outcome<never, never, P>`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to check
 * @returns true if the Outcome is Panicked, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Err, type Outcome, Panicked, isPanicked } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(isPanicked(Panicked("boom")), true);
 * assertEquals(isPanicked(Err("failed")), false);
 *
 * const outcome: Outcome<number, string> = Panicked("boom");
 * if (isPanicked(outcome)) {
 *   const payload: unknown = union(outcome); // the variant: outcome is Panicked
 *   assertEquals(payload, "boom");
 * }
 * ```
 */
export function isPanicked<T, E, P>(
	self: Outcome<T, E, P>,
): self is Enum<Isolate<OutcomeVariants<T, E, P>, "Panicked">> &
	Outcome<never, never, P> {
	return isolate(self, "Panicked");
}

/**
 * Checks if an Outcome is Panicked and its payload satisfies a predicate.
 * With a type-guard predicate it is how a payload is narrowed: there is no
 * separate downcast.
 *
 * A type guard that narrows both the variant and the type parameters: the
 * Outcome becomes its Panicked variant and an `Outcome<never, never, Q>`,
 * which fits `Outcome<T, E, Q>`, where `Q` is the type a type-guard predicate
 * guards (or `P` for a boolean predicate).
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template Q The narrowed payload type when the predicate is a type guard
 * @param self The Outcome to check
 * @param predicate A function that tests the payload (may be a type guard)
 * @returns true if the Outcome is Panicked and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Panic } from "@sekhmet/panic";
 * import { type Outcome, Panicked, isPanicAnd } from "@sekhmet/panic/outcome/mini";
 *
 * const outcome: Outcome<number, string> = Panicked(
 *   new Panic({ message: "bad state", cause: null }),
 * );
 *
 * if (isPanicAnd(outcome, (p): p is Panic<unknown> => p instanceof Panic)) {
 *   const narrowed: Outcome<number, string, Panic<unknown>> = outcome;
 *   assertEquals(narrowed, outcome);
 * }
 * const text: Outcome<number, string> = Panicked("text");
 * assertEquals(isPanicAnd(text, (p) => p instanceof Panic), false);
 * ```
 */
export function isPanicAnd<T, E, P, Q extends P>(
	self: Outcome<T, E, P>,
	predicate: ((payload: P) => payload is Q) | ((payload: P) => boolean),
): self is Enum<Isolate<OutcomeVariants<T, E, Q>, "Panicked">> &
	Outcome<never, never, Q> {
	return isolateAnd(self, "Panicked", predicate);
}
