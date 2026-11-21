/**
 * Tree-shakable `Attempt`: how an attempt to handle an issue ended,
 * `AlreadyHandled(residue)`, `Handled(residue)` or `Failed(error)`. Every
 * operation is a free function taking the attempt first; for method
 * chaining, import `@sekhmet/issue/attempt` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Attempt, Failed, Handled, isResolved, map, unwrapOr } from "@sekhmet/issue/attempt/mini";
 *
 * const handled: Attempt<number, string> = Handled(8080);
 * const failed: Attempt<number, string> = Failed("offline");
 *
 * assertEquals(isResolved(handled), true);
 * assertEquals(unwrapOr(map(failed, (port) => port + 1), 80), 80);
 * ```
 *
 * @module
 */

export * from "./accessors.ts";
export * from "./core.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
