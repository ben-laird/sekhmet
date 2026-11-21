/**
 * Testing an issue's state: `isUnhandled`, `isHandled`, and their `…And`
 * forms, which also test the value or residue it holds.
 *
 * Each returns a boolean, not a type guard: handling switches an issue's
 * state in place, so a narrowing on the issue could go stale after an
 * `await` or a call. To narrow, read a snapshot with `state` and test it
 * with `@sekhmet/issue/state`'s predicates; a snapshot never changes.
 *
 * @module
 */

import { isolate, isolateAnd } from "@sekhmet/enum/core/mini";
import { state } from "./accessors.ts";
import type { Issue } from "./core.ts";

/**
 * Checks whether the issue is still unhandled.
 *
 * Returns a boolean rather than narrowing: the issue changes in place, so a
 * narrowing on it could go stale after an `await`. To narrow, test the
 * snapshot `state` returns, with `@sekhmet/issue/state`'s `isUnhandled`.
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { issue, state } from "@sekhmet/issue/issue/mini";
 * import { isUnhandled as isStateUnhandled } from "@sekhmet/issue/state/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * const current = state(notFound);
 *
 * if (isStateUnhandled(current)) {
 * 	const path: string = union(current); // stays true: the snapshot never changes
 * 	assertEquals(path, "app.json");
 * }
 * ```
 */
export function isUnhandled<T, R>(self: Issue<T, R>): boolean {
	return isolate(state(self), "Unhandled");
}

/**
 * Checks whether the issue is still unhandled, with a value that satisfies
 * `predicate`.
 *
 * Returns a boolean rather than narrowing: the issue changes in place, so a
 * narrowing on it could go stale after an `await`. To narrow, test the
 * snapshot `state` returns, with `@sekhmet/issue/state`'s `isUnhandled`.
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
 * Returns a boolean rather than narrowing: the issue changes in place, so a
 * narrowing on it could go stale after an `await`. To narrow, test the
 * snapshot `state` returns, with `@sekhmet/issue/state`'s `isHandled`.
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { handle, issue, state } from "@sekhmet/issue/issue/mini";
 * import { isHandled as isStateHandled } from "@sekhmet/issue/state/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * handle(notFound, 8080);
 * const current = state(notFound);
 *
 * if (isStateHandled(current)) {
 * 	const port: number = union(current);
 * 	assertEquals(port, 8080);
 * }
 * ```
 */
export function isHandled<T, R>(self: Issue<T, R>): boolean {
	return isolate(state(self), "Handled");
}

/**
 * Checks whether the issue has been handled, with a residue that satisfies
 * `predicate`.
 *
 * Returns a boolean rather than narrowing: the issue changes in place, so a
 * narrowing on it could go stale after an `await`. To narrow, test the
 * snapshot `state` returns, with `@sekhmet/issue/state`'s `isHandled`.
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
