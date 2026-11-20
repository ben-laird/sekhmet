/**
 * The `ControlFlow` class and its `Continue` and `Break` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Creates a `ControlFlow` that tells the caller to go on as normal.
 *
 * `Break` defaults to `never`, so a function returning `Break(x)` on one path
 * and `Continue(y)` on another infers cleanly into `ControlFlow<X, Y>`.
 *
 * @template B The type of the break value (defaults to never, since Continue holds none)
 * @template C The type of the continue value
 * @param value The value to continue with
 * @returns A ControlFlow in the Continue variant holding the value
 *
 * @example
 * ```ts
 * import { type ControlFlow, Continue } from "@sekhmet/enum/control-flow/mini";
 *
 * const next = Continue(1);
 * const typed: ControlFlow<string, number> = Continue<string, number>(1);
 * ```
 */
export function Continue<B = never, C = unknown>(value: C): ControlFlow<B, C> {
	return new ControlFlow<B, C>("Continue", value);
}

/**
 * Creates a `ControlFlow` that tells the caller to exit early.
 *
 * `Continue` defaults to `never`, so a function returning `Break(x)` on one
 * path and `Continue(y)` on another infers cleanly into `ControlFlow<X, Y>`.
 *
 * @template B The type of the break value
 * @template C The type of the continue value (defaults to never, since Break holds none)
 * @param value The value to break with
 * @returns A ControlFlow in the Break variant holding the value
 *
 * @example
 * ```ts
 * import { Break, type ControlFlow } from "@sekhmet/enum/control-flow/mini";
 *
 * const stop = Break("found");
 * const typed: ControlFlow<string, number> = Break<string, number>("found");
 * ```
 */
export function Break<B = unknown, C = never>(value: B): ControlFlow<B, C> {
	return new ControlFlow<B, C>("Break", value);
}

/**
 * The variant structure of a ControlFlow:
 * - Continue: holds a value of type C
 * - Break: holds a value of type B
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 */
type Variants<B, C> = Split<{ Continue: [value: C]; Break: [value: B] }>;

/**
 * Type alias exposing the internal variant structure of ControlFlow, for
 * advanced type manipulations.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 */
export type { Variants as ControlFlowVariants };

/**
 * Tells an operation whether to exit early or go on as usual: Rust's
 * `std::ops::ControlFlow`.
 *
 * `ControlFlow<B, C>` has two variants:
 * - `Continue(value)`: go on as normal, carrying a value of type C
 * - `Break(value)`: exit early, carrying a value of type B
 *
 * Use it where a step decides between going deeper and turning back, such as
 * a visitor, a middleware layer or a `tryForEach`-style loop. `C` defaults to
 * `undefined`, Rust's `()`, for a step that only ever breaks with a value.
 *
 * @template B The type of the break value
 * @template C The type of the continue value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Break, Continue, type ControlFlow } from "@sekhmet/enum/control-flow/mini";
 *
 * function firstNegative(numbers: number[]): number | undefined {
 *   for (const n of numbers) {
 *     const flow: ControlFlow<number> = n < 0 ? Break(n) : Continue(undefined);
 *     const found = match(flow)({ Break: (b) => b, Continue: () => undefined });
 *     if (found !== undefined) return found;
 *   }
 *   return undefined;
 * }
 *
 * assertEquals(firstNegative([3, -1, -2]), -1);
 * assertEquals(firstNegative([3, 4]), undefined);
 * ```
 */
export class ControlFlow<out B, out C = undefined> extends Enum<
	Variants<B, C>
> {}
