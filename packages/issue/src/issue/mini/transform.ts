/**
 * Turning an issue into something else: `toResult` as a `Result`, `wrap` as
 * the cause of a new issue; and `inspect` and `inspectResidue`, which look
 * at what it holds.
 *
 * @module
 */

import { inspectIsolated, match } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { state } from "./accessors.ts";
import { type Issue, type IssueWording, issue } from "./core.ts";

/**
 * The issue as a `Result`: `Ok(residue)` once it is handled, or `Err` with
 * the issue itself while it is unhandled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to convert
 * @returns The residue as `Ok`, or the issue as `Err`
 *
 * @example
 * ```ts
 * import { assertEquals, assertStrictEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { handle, issue, toResult } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertStrictEquals(unwrapErr(toResult(notFound)), notFound);
 *
 * handle(notFound, 8080);
 * assertEquals(unwrap(toResult(notFound)), 8080);
 * ```
 */
export function toResult<T, R>(self: Issue<T, R>): Result<R, Issue<T, R>> {
	return match(state(self))({
		Unhandled: () => Err<R, Issue<T, R>>(self),
		Handled: (residue) => Ok<R, Issue<T, R>>(residue),
	});
}

/**
 * The value of an issue made by {@linkcode wrap}: the issue it wraps.
 *
 * @template T The wrapped issue's value
 * @template R The residue handling yields
 */
export interface Wrapped<T, R> {
	/** The issue that caused this one */
	readonly cause: Issue<T, R>;
}

/**
 * Wraps the issue as the cause of a new, unhandled issue with the given
 * wording: the new issue's value is `{ cause: self }`, and it yields the same
 * residue type. The new issue starts unhandled whatever the state of its
 * cause; handling one never handles the other.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to wrap
 * @param wording The new issue's code, message, hint and docs
 * @returns A new, unhandled issue whose value holds `self` as its cause
 *
 * @example
 * ```ts
 * import { assertEquals, assertStrictEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/option/mini";
 * import { code, issue, value, wrap } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * const loadFailed = wrap(notFound, {
 * 	code: "config/LoadFailed",
 * 	message: "Couldn't load the config.",
 * });
 *
 * assertEquals(code(loadFailed), "config/LoadFailed");
 * assertStrictEquals(unwrap(value(loadFailed)).cause, notFound);
 * ```
 */
export function wrap<T, R>(
	self: Issue<T, R>,
	wording: IssueWording,
): Issue<Wrapped<T, R>, R> {
	return issue<Wrapped<T, R>, R>({ ...wording, value: { cause: self } });
}

/**
 * Calls `inspector` with the issue's value while it is unhandled, then
 * returns the issue.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to inspect
 * @param inspector Looks at the value
 * @returns `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { inspect, issue } from "@sekhmet/issue/issue/mini";
 *
 * const seen: string[] = [];
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * inspect(notFound, (path) => seen.push(path));
 *
 * assertEquals(seen, ["app.json"]);
 * ```
 */
export function inspect<T, R>(
	self: Issue<T, R>,
	inspector: (value: T) => void,
): Issue<T, R> {
	inspectIsolated(state(self), "Unhandled", inspector);

	return self;
}

/**
 * Calls `inspector` with the issue's residue once it is handled, then
 * returns the issue.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to inspect
 * @param inspector Looks at the residue
 * @returns `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { handle, inspectResidue, issue } from "@sekhmet/issue/issue/mini";
 *
 * const seen: number[] = [];
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * handle(notFound, 8080);
 * inspectResidue(notFound, (port) => seen.push(port));
 *
 * assertEquals(seen, [8080]);
 * ```
 */
export function inspectResidue<T, R>(
	self: Issue<T, R>,
	inspector: (residue: R) => void,
): Issue<T, R> {
	inspectIsolated(state(self), "Handled", inspector);

	return self;
}
