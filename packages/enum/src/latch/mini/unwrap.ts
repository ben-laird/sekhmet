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
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Active, Inactive, type Latch, expect } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * assertEquals(expect(latch, "Expected active connection"), 42);
 *
 * assertThrows(() => expect(Inactive("paused"), "Expected active connection"), Error, "Expected active connection");
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
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Active, Inactive, type Latch, unwrap } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Active(42);
 * assertEquals(unwrap(latch), 42);
 *
 * assertThrows(() => unwrap(Inactive("paused")), Error, "Latch unwrap failed!");
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
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Active, Inactive, type Latch, expectInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * assertEquals(expectInactive(latch, "Expected inactive state"), "paused");
 *
 * assertThrows(() => expectInactive(Active(42), "Expected inactive state"), Error, "Expected inactive state");
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
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Active, Inactive, type Latch, unwrapInactive } from "@sekhmet/enum/latch/mini";
 *
 * const latch: Latch<number, string> = Inactive("paused");
 * assertEquals(unwrapInactive(latch), "paused");
 *
 * assertThrows(() => unwrapInactive(Active(42)), Error, "Latch unwrap failed!");
 * ```
 */
export function unwrapInactive<A, I>(self: Latch<A, I>): I {
	return expectInactive(self, "Latch unwrap failed!");
}
