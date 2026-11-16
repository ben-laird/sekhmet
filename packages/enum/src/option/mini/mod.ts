/**
 * Tree-shakable `Option`: a value that is either `Some(value)` or `None()`.
 * Every operation is a free function taking the option first; for
 * method chaining, import `@sekhmet/enum/option` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Some, filter, map, unwrapOr } from "@sekhmet/enum/option/mini";
 *
 * const big = filter(map(Some(21), (n) => n * 2), (n) => n > 40);
 *
 * assertEquals(unwrapOr(big, 0), 42);
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./core.ts";
export * from "./mutation.ts";
export * from "./predicates.ts";
export * from "./result.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
