/**
 * Tree-shakable `Poll`: a value that is `Ready(value)` or still `Pending()`.
 * For method chaining, import `@sekhmet/enum/poll` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, Ready, isReady, map } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(isReady(map(Ready(2), (n) => n + 1)), true);
 * assertEquals(isReady(Pending()), false);
 * ```
 *
 * @module
 */

export * from "./core.ts";
export * from "./impl.ts";
