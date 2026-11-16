/**
 * Tree-shakable `Result`: either `Ok(value)` or `Err(error)`, for operations
 * that can fail. Every operation is a free function taking the result first;
 * for method chaining, import `@sekhmet/enum/result` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, andThen, map, unwrapOr } from "@sekhmet/enum/result/mini";
 *
 * const parse = (text: string): Result<number, string> =>
 *   Number.isNaN(Number(text)) ? Err(`not a number: ${text}`) : Ok(Number(text));
 *
 * const half = (n: number): Result<number, string> =>
 *   n % 2 === 0 ? Ok(n / 2) : Err(`odd: ${n}`);
 *
 * assertEquals(unwrapOr(map(andThen(parse("84"), half), (n) => n + 1), 0), 43);
 * assertEquals(unwrapOr(andThen(parse("x"), half), 0), 0);
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./core.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
