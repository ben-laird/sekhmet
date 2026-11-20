/**
 * Reading an outcome's payload as an `Option`: `value`, `error` and
 * `blockedBy`.
 *
 * @module
 */

import { isolate, union } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import type { JobEnd } from "./core.ts";

/**
 * The value, if the job succeeded.
 *
 * @template T What a succeeded job returned
 * @param self The outcome
 * @returns `Some` with the value for `Succeeded`, else `None`
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { Succeeded, value } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(unwrap(value(Succeeded("dist"))), "dist");
 * ```
 */
export function value<T>(self: JobEnd<T>): Option<T> {
	if (isolate(self, "Succeeded")) return Some(union(self));
	return None();
}

/**
 * What the job's body threw, if it failed.
 *
 * @template T What a succeeded job returned
 * @param self The outcome
 * @returns `Some` with the error for `Failed`, else `None`
 *
 * @example
 * ```ts
 * import { isNone } from "@sekhmet/enum/option/mini";
 * import { error, Succeeded } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(isNone(error(Succeeded(1))), true);
 * ```
 */
export function error<T>(self: JobEnd<T>): Option<unknown> {
	if (isolate(self, "Failed")) return Some(union(self));
	return None();
}

/**
 * The needs that blocked the job, if it was blocked, in declaration order.
 *
 * @template T What a succeeded job returned
 * @param self The outcome
 * @returns `Some` with the needs' names for `Blocked`, else `None`
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { Blocked, blockedBy } from "@sekhmet/job/end/mini";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(unwrap(blockedBy(Blocked(["lint"]))), ["lint"]);
 * ```
 */
export function blockedBy<T>(self: JobEnd<T>): Option<readonly string[]> {
	if (isolate(self, "Blocked")) return Some(union(self));
	return None();
}
