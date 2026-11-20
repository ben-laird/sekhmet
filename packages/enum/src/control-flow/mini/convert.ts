/**
 * Reading a control flow's value: `breakValue` and `continueValue` (to an
 * `Option`), `breakOk` and `continueOk` (to a `Result`), and `intoValue`.
 *
 * @module
 */

import { match, union } from "@/src/core/mini/exit.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import type { ControlFlow } from "./core.ts";

/**
 * Converts a ControlFlow to an Option of its break value: Rust's
 * `break_value`.
 *
 * Transforms `Break(value)` into `Some(value)` and `Continue(_)` into
 * `None`, discarding the continue value.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to convert
 * @returns Some holding the value if Break, None if Continue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { Break, Continue, breakValue } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(unwrap(breakValue(Break("stop"))), "stop");
 * assertEquals(isNone(breakValue(Continue(1))), true);
 * ```
 */
export function breakValue<B, C>(self: ControlFlow<B, C>): Option<B> {
	return match(self)({
		Continue: () => None<B>(),
		Break: (value) => Some(value),
	});
}

/**
 * Converts a ControlFlow to an Option of its continue value: Rust's
 * `continue_value`.
 *
 * Transforms `Continue(value)` into `Some(value)` and `Break(_)` into
 * `None`, discarding the break value.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to convert
 * @returns Some holding the value if Continue, None if Break
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { Break, Continue, continueValue } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(unwrap(continueValue(Continue(1))), 1);
 * assertEquals(isNone(continueValue(Break("stop"))), true);
 * ```
 */
export function continueValue<B, C>(self: ControlFlow<B, C>): Option<C> {
	return match(self)({
		Continue: (value) => Some(value),
		Break: () => None<C>(),
	});
}

/**
 * Converts a ControlFlow to a Result whose success is the break value:
 * Rust's `break_ok`.
 *
 * Transforms `Break(value)` into `Ok(value)` and `Continue(value)` into
 * `Err(value)`. Use it where breaking is the goal, such as a search that
 * stops at the first hit.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to convert
 * @returns Ok holding the value if Break, Err holding the value if Continue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { Break, Continue, breakOk } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(unwrap(breakOk(Break("found"))), "found");
 * assertEquals(unwrapErr(breakOk(Continue(3))), 3);
 * ```
 */
export function breakOk<B, C>(self: ControlFlow<B, C>): Result<B, C> {
	return match(self)({
		Continue: (value) => Err<B, C>(value),
		Break: (value) => Ok<B, C>(value),
	});
}

/**
 * Converts a ControlFlow to a Result whose success is the continue value:
 * Rust's `continue_ok`.
 *
 * Transforms `Continue(value)` into `Ok(value)` and `Break(value)` into
 * `Err(value)`. Use it where breaking is the failure, such as validation
 * that stops at the first error.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to convert
 * @returns Ok holding the value if Continue, Err holding the value if Break
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { Break, Continue, continueOk } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(unwrap(continueOk(Continue(3))), 3);
 * assertEquals(unwrapErr(continueOk(Break("invalid"))), "invalid");
 * ```
 */
export function continueOk<B, C>(self: ControlFlow<B, C>): Result<C, B> {
	return match(self)({
		Continue: (value) => Ok<C, B>(value),
		Break: (value) => Err<C, B>(value),
	});
}

/**
 * Extracts the value of a ControlFlow whose two variants hold the same type:
 * Rust's `ControlFlow<T, T>::into_value`.
 *
 * Returns the value of `Break(value)` or `Continue(value)` alike. `T` is the
 * common type TypeScript infers from the break and continue types, which is
 * always sound: a `never` side drops out (`Continue(1)` gives `number`), a
 * nullable side is added (`ControlFlow<number, undefined>` gives
 * `number | undefined`), and related types meet (`ControlFlow<"a", "b">`
 * gives `"a" | "b"`, `ControlFlow<"a", string>` gives `string`). Only
 * unrelated types, such as `ControlFlow<string, number>`, are a type error.
 *
 * @template T The type of both the break and the continue value
 * @param self A ControlFlow holding a T in either variant
 * @returns The value held by either variant
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Break, Continue, type ControlFlow, intoValue } from "@sekhmet/enum/control-flow/mini";
 *
 * const stopped: ControlFlow<number, number> = Break(1);
 * const going: ControlFlow<number, number> = Continue(2);
 *
 * assertEquals(intoValue(stopped), 1);
 * assertEquals(intoValue(going), 2);
 * ```
 */
export function intoValue<T>(self: ControlFlow<T, T>): T {
	return union(self);
}
