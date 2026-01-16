import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Latch } from "./core.ts";

/**
 * Type guard that checks if a Latch is in the Active state.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to check
 * @returns True if the Latch is Active, narrowing the type accordingly
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * if (isActive(latch)) {
 *   // latch is now Latch<number, never>
 * }
 * ```
 */
export function isActive<A, I>(self: Latch<A, I>): self is Latch<A, never> {
	return isolate(self, "Active");
}

/**
 * Type guard that checks if a Latch is Active AND satisfies a predicate on its value.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template B A narrowed type that A can be refined to
 * @param self The Latch to check
 * @param predicate Additional condition the active value must satisfy
 * @returns True if Active and the predicate returns true
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * if (isActiveAnd(latch, (n) => n > 0)) {
 *   // latch is Active and value is positive
 * }
 * ```
 */
export function isActiveAnd<A, I, B extends A>(
	self: Latch<A, I>,
	predicate: ((value: A) => value is B) | ((value: A) => boolean),
): self is Latch<B, never> {
	return isolateAnd(self, "Active", predicate);
}

/**
 * Type guard that checks if a Latch is in the Inactive state.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to check
 * @returns True if the Latch is Inactive, narrowing the type accordingly
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * if (isInactive(latch)) {
 *   // latch is now Latch<never, string>
 * }
 * ```
 */
export function isInactive<A, I>(self: Latch<A, I>): self is Latch<never, I> {
	return isolate(self, "Inactive");
}

/**
 * Type guard that checks if a Latch is Inactive AND satisfies a predicate on its value.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @template J A narrowed type that I can be refined to
 * @param self The Latch to check
 * @param predicate Additional condition the inactive value must satisfy
 * @returns True if Inactive and the predicate returns true
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("error");
 * if (isInactiveAnd(latch, (s) => s.startsWith("error"))) {
 *   // latch is Inactive and value starts with "error"
 * }
 * ```
 */
export function isInactiveAnd<A, I, J extends I>(
	self: Latch<A, I>,
	predicate: ((value: I) => value is J) | ((value: I) => boolean),
): self is Latch<never, J> {
	return isolateAnd(self, "Inactive", predicate);
}
