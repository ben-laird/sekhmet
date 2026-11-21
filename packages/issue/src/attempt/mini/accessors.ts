/**
 * Reading an attempt as another enum: `residue` and `error` as an `Option`,
 * and `toResult` as a `Result`.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import type { Attempt } from "./core.ts";

/**
 * The residue, if the issue ended up handled (by this attempt or before it).
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to read
 * @returns `Some(residue)` for `Handled` or `AlreadyHandled`, else `None`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap as unwrapOption } from "@sekhmet/enum/option/mini";
 * import { AlreadyHandled, Failed, residue } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(unwrapOption(residue(AlreadyHandled(8080))), 8080);
 * assertEquals(isNone(residue(Failed("offline"))), true);
 * ```
 */
export function residue<R, E>(self: Attempt<R, E>): Option<R> {
	return match(self)({
		AlreadyHandled: (value) => Some(value),
		Handled: (value) => Some(value),
		Failed: () => None<R>(),
	});
}

/**
 * The recovery's error, if the attempt failed.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to read
 * @returns `Some(error)` for `Failed`, else `None`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap as unwrapOption } from "@sekhmet/enum/option/mini";
 * import { error, Failed, Handled } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(unwrapOption(error(Failed("offline"))), "offline");
 * assertEquals(isNone(error(Handled(8080))), true);
 * ```
 */
export function error<R, E>(self: Attempt<R, E>): Option<E> {
	return match(self)({
		AlreadyHandled: () => None<E>(),
		Handled: () => None<E>(),
		Failed: (value) => Some(value),
	});
}

/**
 * The attempt as a `Result`: `Ok(residue)` when the issue ended up handled
 * (by this attempt or before it), `Err(error)` when the recovery failed.
 * Which of the two handled variants it was is dropped.
 *
 * @template R The residue handling yields
 * @template E The error a failed recovery returned
 * @param self The attempt to convert
 * @returns The residue as `Ok`, or the error as `Err`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap as unwrapResult, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { AlreadyHandled, Failed, toResult } from "@sekhmet/issue/attempt/mini";
 *
 * assertEquals(unwrapResult(toResult(AlreadyHandled(8080))), 8080);
 * assertEquals(unwrapErr(toResult(Failed("offline"))), "offline");
 * ```
 */
export function toResult<R, E>(self: Attempt<R, E>): Result<R, E> {
	return match(self)({
		AlreadyHandled: (value) => Ok<R, E>(value),
		Handled: (value) => Ok<R, E>(value),
		Failed: (value) => Err<R, E>(value),
	});
}
