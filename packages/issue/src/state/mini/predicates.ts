/**
 * Testing an issue state: `isUnhandled` and `isHandled`, which narrow the
 * state to its variant, and their `…And` forms, which also test the value
 * or residue it holds.
 *
 * A state is an immutable snapshot, so a narrowing on it stays true: read
 * one from an issue with `state`, and narrow that, rather than the issue,
 * which handling switches in place.
 *
 * @module
 */

import {
	type Enum,
	type Isolate,
	isolate,
	isolateAnd,
} from "@sekhmet/enum/core/mini";
import type { IssueState, IssueStateVariants } from "./core.ts";

/**
 * Checks whether the state is `Unhandled`.
 *
 * Narrows the variant, so its value can be read directly. The type
 * parameters stay as they are, since a state is invariant in both.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The state to check
 * @returns Whether it is `Unhandled`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { IssueState, isUnhandled } from "@sekhmet/issue/state/mini";
 *
 * const current = new IssueState<string, number>("Unhandled", "app.json");
 *
 * if (isUnhandled(current)) {
 * 	const path: string = union(current);
 * 	assertEquals(path, "app.json");
 * }
 * ```
 */
export function isUnhandled<T, R>(
	self: IssueState<T, R>,
): self is Enum<Isolate<IssueStateVariants<T, R>, "Unhandled">> &
	IssueState<T, R> {
	return isolate(self, "Unhandled");
}

/**
 * Checks whether the state is `Unhandled`, with a value that satisfies
 * `predicate`.
 *
 * Returns a boolean rather than narrowing: a state is invariant in its
 * value, so a type-guard predicate couldn't narrow `T`. Use
 * {@linkcode isUnhandled} to narrow the variant.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The state to check
 * @param predicate Tests the value
 * @returns Whether it is `Unhandled` and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { IssueState, isUnhandledAnd } from "@sekhmet/issue/state/mini";
 *
 * const current = new IssueState<string, number>("Unhandled", "app.json");
 *
 * assertEquals(isUnhandledAnd(current, (path) => path.endsWith(".json")), true);
 * ```
 */
export function isUnhandledAnd<T, R>(
	self: IssueState<T, R>,
	predicate: (value: T) => boolean,
): boolean {
	return isolateAnd(self, "Unhandled", predicate);
}

/**
 * Checks whether the state is `Handled`.
 *
 * Narrows the variant, so its residue can be read directly. The type
 * parameters stay as they are, since a state is invariant in both.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The state to check
 * @returns Whether it is `Handled`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { IssueState, isHandled } from "@sekhmet/issue/state/mini";
 *
 * const current = new IssueState<string, number>("Handled", 8080);
 *
 * if (isHandled(current)) {
 * 	const port: number = union(current);
 * 	assertEquals(port, 8080);
 * }
 * ```
 */
export function isHandled<T, R>(
	self: IssueState<T, R>,
): self is Enum<Isolate<IssueStateVariants<T, R>, "Handled">> &
	IssueState<T, R> {
	return isolate(self, "Handled");
}

/**
 * Checks whether the state is `Handled`, with a residue that satisfies
 * `predicate`.
 *
 * Returns a boolean rather than narrowing: a state is invariant in its
 * residue, so a type-guard predicate couldn't narrow `R`. Use
 * {@linkcode isHandled} to narrow the variant.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The state to check
 * @param predicate Tests the residue
 * @returns Whether it is `Handled` and the predicate holds
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { IssueState, isHandledAnd } from "@sekhmet/issue/state/mini";
 *
 * const current = new IssueState<string, number>("Handled", 8080);
 *
 * assertEquals(isHandledAnd(current, (port) => port > 1024), true);
 * ```
 */
export function isHandledAnd<T, R>(
	self: IssueState<T, R>,
	predicate: (residue: R) => boolean,
): boolean {
	return isolateAnd(self, "Handled", predicate);
}
