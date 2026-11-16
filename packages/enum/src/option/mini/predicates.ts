/**
 * Testing an option: `isSome`, `isSomeAnd` and `isNone`.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Option, OptionVariants } from "./core.ts";

/**
 * Type guard to check if the Option contains a value (is in the Some state).
 *
 * Narrows both the variant and the type parameter: the Option becomes its
 * Some variant, so its value can be read directly, and stays an `Option<T>`.
 *
 * @param self - The Option to check
 * @returns true if the Option is Some, false if it is None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { None, type Option, Some, isSome } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(isSome(Some(42)), true);
 * assertEquals(isSome(None()), false);
 *
 * const option: Option<number> = Some(42);
 * if (isSome(option)) {
 *   const value: number = union(option); // the variant: option is Some
 *   const same: Option<number> = option; // the type parameter: still an Option<number>
 *   assertEquals(value, 42);
 *   assertEquals(same, option);
 * }
 * ```
 */
export function isSome<T>(
	self: Option<T>,
): self is Enum<Isolate<OptionVariants<T>, "Some">> & Option<T> {
	return isolate(self, "Some");
}

/**
 * Checks if the Option is Some and the contained value satisfies the predicate.
 *
 * Returns false if the Option is None or if the predicate returns false.
 * Supports both type guards and regular boolean predicates.
 *
 * Narrows both the variant and the type parameter: the Option becomes its
 * Some variant and an `Option<U>`, where `U` is the type a type-guard
 * predicate guards (or `T` for a boolean predicate).
 *
 * @param self - The Option to check
 * @param predicate - Function that tests the value, can be a type guard or boolean predicate
 * @returns true if the Option is Some and the predicate passes, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { None, type Option, Some, isSomeAnd } from "@sekhmet/enum/option/mini";
 *
 * const isEven = (n: number) => n % 2 === 0;
 *
 * assertEquals(isSomeAnd(Some(4), isEven), true);
 * assertEquals(isSomeAnd(Some(3), isEven), false);
 * assertEquals(isSomeAnd(None<number>(), isEven), false);
 *
 * const option: Option<string | number> = Some(42);
 * if (isSomeAnd(option, (v): v is number => typeof v === "number")) {
 *   const value: number = union(option); // the variant: option is Some, holding a number
 *   const narrowed: Option<number> = option; // the type parameter: an Option<number>
 *   assertEquals(value, 42);
 *   assertEquals(narrowed, option);
 * }
 * ```
 */
export function isSomeAnd<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Enum<Isolate<OptionVariants<U>, "Some">> & Option<U> {
	return isolateAnd(self, "Some", predicate);
}

/**
 * Type guard to check if the Option is empty (is in the None state).
 *
 * Narrows both the variant and the type parameter: the Option becomes its
 * None variant, which holds no value, and an `Option<never>`, which fits an
 * Option of any type.
 *
 * @param self - The Option to check
 * @returns true if the Option is None, false if it is Some
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { None, type Option, Some, isNone } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(isNone(None()), true);
 * assertEquals(isNone(Some(42)), false);
 *
 * const option: Option<number> = None();
 * if (isNone(option)) {
 *   // the variant: option is None, so no Some arm is needed
 *   assertEquals(match(option)({ None: () => "empty" }), "empty");
 *   // the type parameter: option is an Option<never>, so it fits any Option
 *   const other: Option<string> = option;
 *   assertEquals(other, None());
 * }
 * ```
 */
export function isNone<T>(
	self: Option<T>,
): self is Enum<Isolate<OptionVariants<T>, "None">> & Option<never> {
	return isolate(self, "None");
}
