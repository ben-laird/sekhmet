/**
 * Tree-shakable `Outcome`: what came of running work inside a panic
 * boundary, `Ok(value)`, an expected `Err(error)` or `Panicked(payload)`.
 * Every operation is a free function taking the outcome first; for method
 * chaining, import `@sekhmet/panic/outcome` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, map, mapErr, unwrapOr } from "@sekhmet/panic/outcome/mini";
 *
 * const failed: Outcome<number, string> = Err("not found");
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(unwrapOr(map(Ok(20), (n) => n + 1), 0), 21);
 * assertEquals(unwrapOr(failed, 0), 0);
 * // A panic is never an expected error: mapErr passes it through
 * assertEquals(mapErr(bug, (e) => e.length), Panicked("boom"));
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./convert.ts";
export * from "./core.ts";
export * from "./panic.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
