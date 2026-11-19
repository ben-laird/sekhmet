/**
 * Tree-shakable `JobOutcome`: how a job ended in one run, with self-first
 * functions over it. For method chaining, import `@sekhmet/job/outcome`
 * instead.
 *
 * @example
 * ```ts
 * import { all, Failed, isUnhealthy, Succeeded } from "@sekhmet/job/outcome/mini";
 * import { assertEquals } from "@std/assert";
 *
 * const combined = all({ lint: Failed(new Error("lint")), test: Succeeded(1) });
 * assertEquals(isUnhealthy(combined), true);
 * ```
 *
 * @module
 */

export * from "./accessors.ts";
export * from "./all.ts";
export * from "./core.ts";
export * from "./predicates.ts";
export * from "./transform.ts";
