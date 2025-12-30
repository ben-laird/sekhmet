import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Option } from "./core.ts";

/**
 * Checks if the Option contains a value (is in the Some state).
 *
 * @param self - The Option to check
 * @returns true if the Option is Some, false if it is None
 *
 * @example
 * ```ts
 * isSome(Some(42)); // true
 * isSome(None());   // false
 * ```
 */
export function isSome<T>(self: Option<T>): boolean {
	return isolate(self, "Some");
}

/**
 * Checks if the Option is Some and the contained value satisfies the predicate.
 *
 * Returns false if the Option is None or if the predicate returns false.
 * Supports both type guards and regular boolean predicates.
 *
 * @param self - The Option to check
 * @param predicate - Function that tests the value, can be a type guard or boolean predicate
 * @returns true if the Option is Some and the predicate passes, false otherwise
 *
 * @example
 * ```ts
 * const isEven = (n: number) => n % 2 === 0;
 *
 * isSomeAnd(Some(4), isEven);  // true
 * isSomeAnd(Some(3), isEven);  // false
 * isSomeAnd(None(), isEven);   // false
 * ```
 */
export function isSomeAnd<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Option<U> {
	return isolateAnd(self, "Some", predicate);
}

/**
 * Checks if the Option is empty (is in the None state).
 *
 * @param self - The Option to check
 * @returns true if the Option is None, false if it is Some
 *
 * @example
 * ```ts
 * isNone(None());   // true
 * isNone(Some(42)); // false
 * ```
 */
export function isNone<T>(self: Option<T>): self is Option<never> {
	return isolate(self, "None");
}
