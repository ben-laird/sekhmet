/**
 * Getting the residue out of an issue: `expectResidue`/`unwrapResidue`
 * panic while it is unhandled; `residueOr` and `residueOrElse` take a
 * fallback. None of them handles the issue.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { panic } from "@sekhmet/panic/mini/core";
import { state } from "./accessors.ts";
import type { Issue } from "./core.ts";

/**
 * Returns the residue of a handled issue, or panics with `message` while it
 * is unhandled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to unwrap
 * @param message The panic's message if the issue is unhandled
 * @returns The residue
 * @throws {Panic} With `message`, and the issue as its cause, if it is unhandled
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { expectResidue, handle, issue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertThrows(() => expectResidue(notFound, "the config must be loaded"), Error, "the config must be loaded");
 *
 * handle(notFound, 8080);
 * assertEquals(expectResidue(notFound, "the config must be loaded"), 8080);
 * ```
 */
export function expectResidue<T, R>(self: Issue<T, R>, message: string): R {
	return match(state(self))({
		Unhandled: () => panic({ message, cause: self }),
		Handled: (residue) => residue,
	});
}

/**
 * Returns the residue of a handled issue, or panics while it is unhandled.
 * Prefer {@linkcode expectResidue}, whose message says why it should have
 * been handled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to unwrap
 * @returns The residue
 * @throws {Panic} "Issue unwrap failed!", with the issue as its cause, if it is unhandled
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { handle, issue, unwrapResidue } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 * assertThrows(() => unwrapResidue(notFound), Error, "Issue unwrap failed!");
 *
 * handle(notFound, 8080);
 * assertEquals(unwrapResidue(notFound), 8080);
 * ```
 */
export function unwrapResidue<T, R>(self: Issue<T, R>): R {
	return expectResidue(self, "Issue unwrap failed!");
}

/**
 * Returns the residue of a handled issue, or `fallback` while it is
 * unhandled. The issue stays unhandled.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @param fallback The value to return while it is unhandled
 * @returns The residue, or `fallback`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { issue, residueOr } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "app.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(residueOr(notFound, 8080), 8080);
 * ```
 */
export function residueOr<T, R>(self: Issue<T, R>, fallback: R): R {
	return match(state(self))({
		Unhandled: () => fallback,
		Handled: (residue) => residue,
	});
}

/**
 * Returns the residue of a handled issue, or computes one from its value
 * while it is unhandled. The issue stays unhandled; to handle it, use
 * `handle` or `attempt`.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to read
 * @param fallback Turns the value into a residue
 * @returns The residue, or `fallback`'s value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { issue, residueOrElse } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({ value: "dev.json", code: "config/NotFound", message: "No config file." });
 *
 * assertEquals(residueOrElse(notFound, (path) => (path === "dev.json" ? 3000 : 80)), 3000);
 * ```
 */
export function residueOrElse<T, R>(
	self: Issue<T, R>,
	fallback: (value: T) => R,
): R {
	return match(state(self))({
		Unhandled: fallback,
		Handled: (residue) => residue,
	});
}
