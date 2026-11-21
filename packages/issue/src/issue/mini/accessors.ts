/**
 * Reading an issue: its wording (`code`, `message`, `hint`, `docs`), its
 * `state`, and the `value` or `residue` that state holds.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import type { IssueState } from "@/src/state/mini/core.ts";
import type { Issue } from "./core.ts";

/**
 * The issue's permanent name, such as `config/NotFound`.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns Its code
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { code, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(code(notFound), "config/NotFound");
 * ```
 */
export function code<T, R>(self: Issue<T, R>): string {
	return getStructParams(self).code;
}

/**
 * What went wrong, in a sentence.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns Its message
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { issue, message } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(message(notFound), "No config file.");
 * ```
 */
export function message<T, R>(self: Issue<T, R>): string {
	return getStructParams(self).message;
}

/**
 * What to do about the issue, if it was given one.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns Its hint, or `undefined`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { hint, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue({
 * 	value: "app.json",
 * 	code: "config/NotFound",
 * 	message: "No config file.",
 * 	hint: "Create one.",
 * });
 *
 * assertEquals(hint(notFound), "Create one.");
 * ```
 */
export function hint<T, R>(self: Issue<T, R>): string | undefined {
	return getStructParams(self).hint;
}

/**
 * A link to more about the issue, if it was given one.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns Its docs link, or `undefined`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { docs, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(docs(notFound), undefined);
 * ```
 */
export function docs<T, R>(self: Issue<T, R>): string | undefined {
	return getStructParams(self).docs;
}

/**
 * Where the issue stands now: `Unhandled(value)` or `Handled(residue)`. The
 * state is a snapshot: handling the issue later switches the issue to a new
 * state, and this one stays as it was.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns Its current state
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
 */
export function state<T, R>(self: Issue<T, R>): IssueState<T, R> {
	return getStructParams(self).state;
}

/**
 * The issue's value, while it is unhandled. Handling drops it.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns `Some(value)` while unhandled, else `None`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { handle, issue, value } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertEquals(unwrap(value(notFound)), "app.json");
 *
 * handle(notFound, 8080);
 * assertEquals(isNone(value(notFound)), true);
 * ```
 */
export function value<T, R>(self: Issue<T, R>): Option<T> {
	return match(state(self))({
		Unhandled: (held) => Some(held),
		Handled: () => None<T>(),
	});
}

/**
 * The issue's residue, once it is handled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @returns `Some(residue)` once handled, else `None`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { handle, issue, residue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertEquals(isNone(residue(notFound)), true);
 *
 * handle(notFound, 8080);
 * assertEquals(unwrap(residue(notFound)), 8080);
 * ```
 */
export function residue<T, R>(self: Issue<T, R>): Option<R> {
	return match(state(self))({
		Unhandled: () => None<R>(),
		Handled: (held) => Some(held),
	});
}
