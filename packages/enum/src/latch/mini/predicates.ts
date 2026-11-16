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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, isActive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * if (isActive(latch)) {
 *   const narrowed: Latch<number, never> = latch;
 * }
 *
 * assertEquals(isActive(latch), true);
 * assertEquals(isActive(Inactive("paused")), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, type Latch, isActiveAnd } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 *
 * assertEquals(isActiveAnd(latch, (n) => n > 0), true);
 * assertEquals(isActiveAnd(latch, (n) => n < 0), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, Inactive, type Latch, isInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * if (isInactive(latch)) {
 *   const narrowed: Latch<never, string> = latch;
 * }
 *
 * assertEquals(isInactive(latch), true);
 * assertEquals(isInactive(Active(42)), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Inactive, type Latch, isInactiveAnd } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("error: timeout");
 *
 * assertEquals(isInactiveAnd(latch, (s) => s.startsWith("error")), true);
 * assertEquals(isInactiveAnd(latch, (s) => s.startsWith("paused")), false);
 * ```
 */
export function isInactiveAnd<A, I, J extends I>(
	self: Latch<A, I>,
	predicate: ((value: I) => value is J) | ((value: I) => boolean),
): self is Latch<never, J> {
	return isolateAnd(self, "Inactive", predicate);
}
