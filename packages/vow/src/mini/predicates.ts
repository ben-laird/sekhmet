/**
 * Testing a vow's state synchronously: `isResolved` and `isPending`.
 *
 * Each predicate is a type guard, shaped like Poll's `isReady` and
 * `isPending`.
 *
 * @module
 */

import { type Enum, type Isolate, isolate } from "@sekhmet/enum/core/mini";
import type { Vow, VowVariants } from "./core.ts";

/**
 * Whether the vow has resolved.
 *
 * Narrows the variant, so its value can be read with `union`, and keeps the
 * vow a `Vow<T>`.
 *
 * @template T The type of the resolved value
 * @param self The vow to check
 * @returns `true` once the vow is `Resolved`
 *
 * @example
 * ```ts
 * import { union } from "@sekhmet/enum/core/mini";
 * import { isResolved, resolved, vowWithResolver } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const vow = resolved(42);
 * if (isResolved(vow)) {
 * 	const value: number = union(vow);
 * 	assertEquals(value, 42);
 * }
 *
 * assertEquals(isResolved(vowWithResolver<number>().vow), false);
 * ```
 */
export function isResolved<T>(
	self: Vow<T>,
): self is Enum<Isolate<VowVariants<T>, "Resolved">> & Vow<T> {
	return isolate(self, "Resolved");
}

/**
 * Whether the vow is still waiting to resolve.
 *
 * Narrows the variant, so it can be matched without a `Resolved` arm, and
 * keeps the vow a `Vow<T>`.
 *
 * @template T The type of the resolved value
 * @param self The vow to check
 * @returns `true` while the vow is `Pending`
 *
 * @example
 * ```ts
 * import { isPending, vowWithResolver } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const { vow, resolve } = vowWithResolver<string>();
 * assertEquals(isPending(vow), true);
 *
 * resolve("done");
 * assertEquals(isPending(vow), false);
 * ```
 */
export function isPending<T>(
	self: Vow<T>,
): self is Enum<Isolate<VowVariants<T>, "Pending">> & Vow<T> {
	return isolate(self, "Pending");
}
