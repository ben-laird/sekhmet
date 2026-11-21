/**
 * Tree-shakable `IssueState`: where an issue stands, `Unhandled(value)` or
 * `Handled(residue)`. A state is an immutable snapshot read from an issue
 * with `state`; for method chaining, import `@sekhmet/issue/state` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini";
 * import { handle, issue, state } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * const before = state(notFound);
 * handle(notFound, 8080);
 *
 * assertEquals(unionKinds(before), "Unhandled");
 * assertEquals(unionKinds(state(notFound)), "Handled");
 * ```
 *
 * @module
 */

export * from "./core.ts";
