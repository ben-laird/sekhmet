/**
 * Transforming a control flow: `mapBreak` and `mapContinue`.
 *
 * @module
 */

import { match } from "@/src/core/mini/exit.ts";
import { Break, Continue, type ControlFlow } from "./core.ts";

/**
 * Maps a ControlFlow's break value by applying a function to it: Rust's
 * `map_break`.
 *
 * If the ControlFlow is Break, applies the mapping to its value. If it is
 * Continue, passes the continue value through unchanged.
 *
 * @template B The type of the original break value
 * @template C The type of the continue value
 * @template T The type of the mapped break value
 * @param self The ControlFlow to map
 * @param mapping A function that transforms the break value
 * @returns A ControlFlow with the mapped value if Break, or the original continue value if Continue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Break, Continue, type ControlFlow, mapBreak } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(mapBreak(Break(2), (n) => n * 10), Break(20));
 *
 * const going: ControlFlow<number, string> = Continue("next");
 * assertEquals(mapBreak(going, (n) => n * 10), Continue("next"));
 * ```
 */
export function mapBreak<B, C, T>(
	self: ControlFlow<B, C>,
	mapping: (value: B) => T,
): ControlFlow<T, C> {
	return match(self)({
		Continue: (value) => Continue<T, C>(value),
		Break: (value) => Break<T, C>(mapping(value)),
	});
}

/**
 * Maps a ControlFlow's continue value by applying a function to it: Rust's
 * `map_continue`.
 *
 * If the ControlFlow is Continue, applies the mapping to its value. If it is
 * Break, passes the break value through unchanged.
 *
 * @template B The type of the break value
 * @template C The type of the original continue value
 * @template T The type of the mapped continue value
 * @param self The ControlFlow to map
 * @param mapping A function that transforms the continue value
 * @returns A ControlFlow with the mapped value if Continue, or the original break value if Break
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Break, Continue, type ControlFlow, mapContinue } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(mapContinue(Continue(2), (n) => n * 10), Continue(20));
 *
 * const stopped: ControlFlow<string, number> = Break("done");
 * assertEquals(mapContinue(stopped, (n) => n * 10), Break("done"));
 * ```
 */
export function mapContinue<B, C, T>(
	self: ControlFlow<B, C>,
	mapping: (value: C) => T,
): ControlFlow<B, T> {
	return match(self)({
		Continue: (value) => Continue<B, T>(mapping(value)),
		Break: (value) => Break<B, T>(value),
	});
}
