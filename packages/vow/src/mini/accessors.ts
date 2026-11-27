/**
 * Reading a vow's state synchronously: `value` as an `Option`, `poll` as a
 * `Poll`.
 *
 * @module
 */

import { union } from "@sekhmet/enum/core/mini/exit";
import { None, type Option, Some } from "@sekhmet/enum/option/mini/core";
import { Pending, type Poll, Ready } from "@sekhmet/enum/poll/mini/core";
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

/**
 * The vow's state now, as a `Poll`: the standard synchronous read.
 *
 * Like `value`, it reads without subscribing, so nothing runs later: a
 * pending vow gives `Pending` now, even if it resolves a moment later. To
 * unwrap work you know settled synchronously, pass the result to
 * `expectReady` from `@sekhmet/enum/poll/mini`.
 *
 * @template T The type of the resolved value
 * @param self The vow to read
 * @returns `Ready` with the value once `Resolved`, `Pending` while `Pending`
 *
 * @example
 * ```ts
 * import { Pending, Ready } from "@sekhmet/enum/poll/mini";
 * import { map, poll, vowWithResolver } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const { vow, resolve } = vowWithResolver<number>();
 * const doubled = map(vow, (n) => n * 2);
 * assertEquals(poll(doubled), Pending());
 *
 * resolve(21);
 * assertEquals(poll(doubled), Ready(42));
 * ```
 */
export function poll<T>(self: Vow<T>): Poll<T> {
	if (isResolved(self)) return Ready(union(self));
	return Pending();
}
