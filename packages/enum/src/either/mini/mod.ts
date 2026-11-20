/**
 * Tree-shakable `Either`: `Left(value)` or `Right(value)`, a value of one of
 * two types where neither side is the error. Every operation is a free
 * function taking the either first; for method chaining, import
 * `@sekhmet/enum/either` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, either, mapLeft } from "@sekhmet/enum/either/mini";
 *
 * const lookup = (key: string): Either<number, string> =>
 *   key === "port" ? Left(8080) : Right(key);
 *
 * const describe = (key: string): string =>
 *   either(mapLeft(lookup(key), (port) => port + 1), {
 *     onLeft: (port) => `port ${port}`,
 *     onRight: (name) => `unknown ${name}`,
 *   });
 *
 * assertEquals(describe("port"), "port 8081");
 * assertEquals(describe("host"), "unknown host");
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./core.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
