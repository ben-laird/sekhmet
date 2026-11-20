/**
 * Testing a control flow: `isBreak` and `isContinue`.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import type { ControlFlow, ControlFlowVariants } from "./core.ts";

/**
 * Checks if a ControlFlow is in the Break variant: Rust's `is_break`.
 *
 * Narrows both the variant and the type parameters: the ControlFlow becomes
 * its Break variant, so its value can be read directly, and a
 * `ControlFlow<B, never>`, which fits a ControlFlow with any continue type.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to check
 * @returns true if the ControlFlow is Break, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Break, Continue, type ControlFlow, isBreak } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(isBreak(Break("stop")), true);
 * assertEquals(isBreak(Continue(1)), false);
 *
 * const flow: ControlFlow<string, number> = Break("stop");
 * if (isBreak(flow)) {
 *   const value: string = union(flow); // the variant: flow is Break
 *   const other: ControlFlow<string, boolean> = flow; // the type parameters: a ControlFlow<string, never>
 *   assertEquals(value, "stop");
 *   assertEquals(other, flow);
 * }
 * ```
 */
export function isBreak<B, C>(
	self: ControlFlow<B, C>,
): self is Enum<Isolate<ControlFlowVariants<B, C>, "Break">> &
	ControlFlow<B, never> {
	return isolate(self, "Break");
}

/**
 * Checks if a ControlFlow is in the Continue variant: Rust's `is_continue`.
 *
 * Narrows both the variant and the type parameters: the ControlFlow becomes
 * its Continue variant, so its value can be read directly, and a
 * `ControlFlow<never, C>`, which fits a ControlFlow with any break type.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 * @param self The ControlFlow to check
 * @returns true if the ControlFlow is Continue, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Break, Continue, type ControlFlow, isContinue } from "@sekhmet/enum/control-flow/mini";
 *
 * assertEquals(isContinue(Continue(1)), true);
 * assertEquals(isContinue(Break("stop")), false);
 *
 * const flow: ControlFlow<string, number> = Continue(1);
 * if (isContinue(flow)) {
 *   const value: number = union(flow); // the variant: flow is Continue
 *   const other: ControlFlow<boolean, number> = flow; // the type parameters: a ControlFlow<never, number>
 *   assertEquals(value, 1);
 *   assertEquals(other, flow);
 * }
 * ```
 */
export function isContinue<B, C>(
	self: ControlFlow<B, C>,
): self is Enum<Isolate<ControlFlowVariants<B, C>, "Continue">> &
	ControlFlow<never, C> {
	return isolate(self, "Continue");
}
