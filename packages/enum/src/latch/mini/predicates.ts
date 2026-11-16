/**
 * Testing a latch: `isActive`, `isActiveAnd`, `isInactive` and `isInactiveAnd`.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Latch, LatchVariants } from "./core.ts";

/**
 * Type guard that checks if a Latch is in the Active state.
 *
 * Narrows both the variant and the type parameters: the Latch becomes its
 * Active variant, so its value can be read directly, and a `Latch<A, never>`,
 * which fits a Latch with any inactive type.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to check
 * @returns True if the Latch is Active, narrowing the type accordingly
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Active, Inactive, type Latch, isActive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * if (isActive(latch)) {
 *   const value: number = union(latch); // the variant: latch is Active
 *   const other: Latch<number, boolean> = latch; // the type parameters: a Latch<number, never>
 *   assertEquals(value, 42);
 *   assertEquals(other, latch);
 * }
 *
 * assertEquals(isActive(latch), true);
 * assertEquals(isActive(Inactive("paused")), false);
 * ```
 */
export function isActive<A, I>(
	self: Latch<A, I>,
): self is Enum<Isolate<LatchVariants<A, I>, "Active">> & Latch<A, never> {
	return isolate(self, "Active");
}

/**
 * Type guard that checks if a Latch is Active AND satisfies a predicate on its value.
 *
 * Narrows both the variant and the type parameters: the Latch becomes its
 * Active variant and a `Latch<B, never>`, where `B` is the type a type-guard
 * predicate guards (or `A` for a boolean predicate).
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B A narrowed type that A can be refined to
 * @param self The Latch to check
 * @param predicate Additional condition the active value must satisfy
 * @returns True if Active and the predicate returns true
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Active, type Latch, isActiveAnd } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 *
 * assertEquals(isActiveAnd(latch, (n) => n > 0), true);
 * assertEquals(isActiveAnd(latch, (n) => n < 0), false);
 *
 * // With type guard
 * const mixed: Latch<string | number, string> = Active(42);
 * if (isActiveAnd(mixed, (v): v is number => typeof v === "number")) {
 *   // the variant: mixed is Active holding a number, so no Inactive arm is needed
 *   assertEquals(match(mixed)({ Active: (n) => n + 1 }), 43);
 *   // the type parameters: mixed is a Latch<number, never>
 *   const narrowed: Latch<number, boolean> = mixed;
 *   assertEquals(narrowed, mixed);
 * }
 * ```
 */
export function isActiveAnd<A, I, B extends A>(
	self: Latch<A, I>,
	predicate: ((value: A) => value is B) | ((value: A) => boolean),
): self is Enum<Isolate<LatchVariants<B, I>, "Active">> & Latch<B, never> {
	return isolateAnd(self, "Active", predicate);
}

/**
 * Type guard that checks if a Latch is in the Inactive state.
 *
 * Narrows both the variant and the type parameters: the Latch becomes its
 * Inactive variant, so its value can be read directly, and a
 * `Latch<never, I>`, which fits a Latch with any active type.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to check
 * @returns True if the Latch is Inactive, narrowing the type accordingly
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Active, Inactive, type Latch, isInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * if (isInactive(latch)) {
 *   const value: string = union(latch); // the variant: latch is Inactive
 *   const other: Latch<boolean, string> = latch; // the type parameters: a Latch<never, string>
 *   assertEquals(value, "paused");
 *   assertEquals(other, latch);
 * }
 *
 * assertEquals(isInactive(latch), true);
 * assertEquals(isInactive(Active(42)), false);
 * ```
 */
export function isInactive<A, I>(
	self: Latch<A, I>,
): self is Enum<Isolate<LatchVariants<A, I>, "Inactive">> & Latch<never, I> {
	return isolate(self, "Inactive");
}

/**
 * Type guard that checks if a Latch is Inactive AND satisfies a predicate on its value.
 *
 * Narrows both the variant and the type parameters: the Latch becomes its
 * Inactive variant and a `Latch<never, J>`, where `J` is the type a type-guard
 * predicate guards (or `I` for a boolean predicate).
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template J A narrowed type that I can be refined to
 * @param self The Latch to check
 * @param predicate Additional condition the inactive value must satisfy
 * @returns True if Inactive and the predicate returns true
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Inactive, type Latch, isInactiveAnd } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("error: timeout");
 *
 * assertEquals(isInactiveAnd(latch, (s) => s.startsWith("error")), true);
 * assertEquals(isInactiveAnd(latch, (s) => s.startsWith("paused")), false);
 *
 * // With type guard
 * const mixed: Latch<number, string | number> = Inactive("paused");
 * if (isInactiveAnd(mixed, (v): v is string => typeof v === "string")) {
 *   // the variant: mixed is Inactive holding a string, so no Active arm is needed
 *   assertEquals(match(mixed)({ Inactive: (s) => s.length }), 6);
 *   // the type parameters: mixed is a Latch<never, string>
 *   const narrowed: Latch<boolean, string> = mixed;
 *   assertEquals(narrowed, mixed);
 * }
 * ```
 */
export function isInactiveAnd<A, I, J extends I>(
	self: Latch<A, I>,
	predicate: ((value: I) => value is J) | ((value: I) => boolean),
): self is Enum<Isolate<LatchVariants<A, J>, "Inactive">> & Latch<never, J> {
	return isolateAnd(self, "Inactive", predicate);
}
