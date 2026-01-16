import { union } from "@/src/core/mini/exit.ts";
import { assertIsolated } from "@/src/core/mini/isolate.ts";
import type { Latch } from "./core.ts";

/**
 * Returns the active value if the Latch is Active, otherwise throws with the given message.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @param message The error message to throw if the Latch is Inactive
 * @returns The active value
 * @throws {Error} If the Latch is Inactive
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * const value = expect(latch, "Expected active connection"); // 42
 * ```
 */
export function expect<A, I>(self: Latch<A, I>, message: string): A {
	const variant = self;

	assertIsolated(variant, "Active", message);

	return union(variant);
}

/**
 * Returns the active value if the Latch is Active, otherwise throws a generic error.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @returns The active value
 * @throws {Error} If the Latch is Inactive
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Active(42);
 * const value = unwrap(latch); // 42
 * ```
 */
export function unwrap<A, I>(self: Latch<A, I>): A {
	return expect(self, "Latch unwrap failed!");
}

/**
 * Returns the inactive value if the Latch is Inactive, otherwise throws with the given message.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @param message The error message to throw if the Latch is Active
 * @returns The inactive value
 * @throws {Error} If the Latch is Active
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * const value = expectInactive(latch, "Expected inactive state"); // "paused"
 * ```
 */
export function expectInactive<A, I>(self: Latch<A, I>, message: string): I {
	const variant = self;

	assertIsolated(variant, "Inactive", message);

	return union(variant);
}

/**
 * Returns the inactive value if the Latch is Inactive, otherwise throws a generic error.
 *
 * @template A The type of the active value
 * @template I The type of the inactive value
 * @param self The Latch to unwrap
 * @returns The inactive value
 * @throws {Error} If the Latch is Active
 *
 * @example
 * ```ts ignore
 * const latch: Latch<number, string> = Inactive("paused");
 * const value = unwrapInactive(latch); // "paused"
 * ```
 */
export function unwrapInactive<A, I>(self: Latch<A, I>): I {
	return expectInactive(self, "Latch unwrap failed!");
}
