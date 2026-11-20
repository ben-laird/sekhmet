/**
 * Tree-shakable `ControlFlow`: either `Continue(value)` or `Break(value)`,
 * telling an operation whether to go on or exit early. Every operation is a
 * free function taking the control flow first; for method chaining, import
 * `@sekhmet/enum/control-flow` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Break, Continue, type ControlFlow, breakValue, mapBreak } from "@sekhmet/enum/control-flow/mini";
 * import { unwrapOr } from "@sekhmet/enum/option/mini";
 *
 * const check = (n: number): ControlFlow<string, number> => {
 *   if (n < 0) return Break(`negative: ${n}`);
 *   return Continue(n);
 * };
 *
 * const reason = (n: number): string => {
 *   const shouted = mapBreak(check(n), (s) => s.toUpperCase());
 *   return unwrapOr(breakValue(shouted), "ok");
 * };
 *
 * assertEquals(reason(-1), "NEGATIVE: -1");
 * assertEquals(reason(1), "ok");
 * ```
 *
 * @module
 */

export * from "./convert.ts";
export * from "./core.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
