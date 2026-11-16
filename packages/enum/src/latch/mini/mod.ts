/**
 * Tree-shakable `Latch`: a two-state value that is `Active(a)` or
 * `Inactive(i)` and can be switched between them in place. For method
 * chaining, import `@sekhmet/enum/latch` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Active, type Latch, deactivate, isActive } from "@sekhmet/enum/latch/mini";
 *
 * const connection: Latch<string, string> = Active("socket");
 * deactivate(connection, "closed by peer");
 *
 * assertEquals(isActive(connection), false);
 * ```
 *
 * @module
 */

export * from "./combinators.ts";
export * from "./core.ts";
export * from "./mutation.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
export * from "./unwrap.ts";
