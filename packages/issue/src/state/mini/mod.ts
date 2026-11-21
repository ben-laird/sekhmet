/**
 * Tree-shakable `IssueState`: where an issue stands, `Unhandled(value)` or
 * `Handled(residue)`. A state is an immutable snapshot read from an issue
 * with `state`, so `isUnhandled` and `isHandled` narrow it soundly; for
 * method chaining, import `@sekhmet/issue/state` instead.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { handle, issue, state } from "@sekhmet/issue/issue/mini";
 * import { isHandled, isUnhandled } from "@sekhmet/issue/state/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * const before = state(notFound);
 * handle(notFound, 8080);
 *
 * assertEquals(isUnhandled(before), true);
 * assertEquals(isHandled(state(notFound)), true);
 * if (isUnhandled(before)) {
 * 	const path: string = union(before);
 * 	assertEquals(path, "app.json");
 * }
 * ```
 *
 * @module
 */

export * from "./core.ts";
export * from "./predicates.ts";
