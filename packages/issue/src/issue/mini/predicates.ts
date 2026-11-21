/**
 * Testing an issue's state: `isUnhandled`, `isHandled`, and their `…And`
 * forms, which also test the value or residue it holds.
 *
 * @module
 */

import { isolate, isolateAnd } from "@sekhmet/enum/core/mini";
import { state } from "./accessors.ts";
import type { Issue } from "./core.ts";

/**
 * Checks whether the issue is still unhandled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to check
 * @returns Whether it is unhandled
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { handle, isUnhandled, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertEquals(isUnhandled(notFound), true);
 *
 * handle(notFound, 8080);
 * assertEquals(isUnhandled(notFound), false);
 * ```
 */
export function isUnhandled<T, R>(self: Issue<T, R>): boolean {
	return isolate(state(self), "Unhandled");
}

/**
 * Checks whether the issue is still unhandled, with a value that satisfies
 * `predicate`.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to check
 * @param predicate Tests the value
 * @returns Whether it is unhandled and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isUnhandledAnd, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(isUnhandledAnd(notFound, (path) => path.endsWith(".json")), true);
 * ```
 */
export function isUnhandledAnd<T, R>(
	self: Issue<T, R>,
	predicate: (value: T) => boolean,
): boolean {
	return isolateAnd(state(self), "Unhandled", predicate);
}

/**
 * Checks whether the issue has been handled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to check
 * @returns Whether it is handled
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { handle, isHandled, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * handle(notFound, 8080);
 *
 * assertEquals(isHandled(notFound), true);
 * ```
 */
export function isHandled<T, R>(self: Issue<T, R>): boolean {
	return isolate(state(self), "Handled");
}

/**
 * Checks whether the issue has been handled, with a residue that satisfies
 * `predicate`.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to check
 * @param predicate Tests the residue
 * @returns Whether it is handled and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { handle, isHandledAnd, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * handle(notFound, 8080);
 *
 * assertEquals(isHandledAnd(notFound, (port) => port > 1024), true);
 * ```
 */
export function isHandledAnd<T, R>(
	self: Issue<T, R>,
	predicate: (residue: R) => boolean,
): boolean {
	return isolateAnd(state(self), "Handled", predicate);
}
