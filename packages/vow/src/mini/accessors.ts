/**
 * Reading a vow's value synchronously as an `Option`: `value`.
 *
 * @module
 */

import { union } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import type { Vow } from "./core.ts";
import { isResolved } from "./predicates.ts";

/**
 * The value, if the vow has resolved.
 *
 * Reads the vow's current state without subscribing to it, so nothing runs
 * later: a pending vow gives `None` now, even if it resolves a moment later.
 * To act on the value whenever it arrives, use `map` or `andThen`.
 *
 * @template T The type of the resolved value
 * @param self The vow to read
 * @returns `Some` with the value once `Resolved`, `None` while `Pending`
 *
 * @example
 * ```ts
 * import { None, Some } from "@sekhmet/enum/option/mini";
 * import { map, value, vowWithResolver } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const { vow, resolve } = vowWithResolver<number>();
 * const doubled = map(vow, (n) => n * 2);
 * assertEquals(value(doubled), None());
 *
 * resolve(21);
 * assertEquals(value(doubled), Some(42));
 * ```
 */
export function value<T>(self: Vow<T>): Option<T> {
	if (isResolved(self)) return Some(union(self));
	return None();
}
