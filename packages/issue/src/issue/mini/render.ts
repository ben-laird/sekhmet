/**
 * `render`: an issue, and the chain of issues that caused it, as plain text.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { value } from "./accessors.ts";
import { Issue } from "./core.ts";
import { isHandled } from "./predicates.ts";

/** The issue in a value's `cause` field, if it holds one. */
function causeOf(held: unknown): Issue<unknown, unknown> | undefined {
	if (typeof held !== "object" || held === null || !("cause" in held)) {
		return undefined;
	}

	return held.cause instanceof Issue ? held.cause : undefined;
}

/** One issue's lines: its heading, then its hint and docs, indented. */
function renderOne<T, R>({
	self,
	prefix,
}: {
	readonly self: Issue<T, R>;
	readonly prefix: string;
}): string[] {
	const { code, message, hint, docs } = getStructParams(self);
	const handled = isHandled(self) ? " (handled)" : "";
	const lines = [`${prefix}${code}${handled}: ${message}`];

	if (hint !== undefined) lines.push(`  hint: ${hint}`);
	if (docs !== undefined) lines.push(`  docs: ${docs}`);

	return lines;
}

/**
 * Renders the issue as plain text: a `code: message` heading, then its hint
 * and docs, each on an indented line when present. A handled issue is
 * marked `(handled)` after its code.
 *
 * While an issue is unhandled and its value has a `cause` that is an issue
 * (as {@linkcode wrap} builds), the cause follows on a `caused by` heading,
 * and so on down the chain. A handled issue no longer holds its value, so the
 * chain stops there. Each issue is printed once: the chain also stops at an
 * issue it has already printed.
 *
 * @template T The typed facts about the problem
 * @template R The residue handling yields
 * @param self The issue to render
 * @returns The issue, and its chain of causes, as lines of text
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { handle, issue, render, wrap } from "@sekhmet/issue/issue/mini";
 *
 * const notFound = issue<string, number>({
 * 	value: "app.json",
 * 	code: "config/NotFound",
 * 	message: "No config file at `app.json`.",
 * 	hint: "Create one, or run with the default config.",
 * });
 * const loadFailed = wrap(notFound, {
 * 	code: "config/LoadFailed",
 * 	message: "Couldn't load the config.",
 * 	docs: "https://example.com/config",
 * });
 * handle(notFound, 8080);
 *
 * assertEquals(
 * 	render(loadFailed),
 * 	[
 * 		"config/LoadFailed: Couldn't load the config.",
 * 		"  docs: https://example.com/config",
 * 		"caused by config/NotFound (handled): No config file at `app.json`.",
 * 		"  hint: Create one, or run with the default config.",
 * 	].join("\n"),
 * );
 * ```
 */
export function render<T, R>(self: Issue<T, R>): string {
	const printed = new Set<unknown>([self]);
	const lines = renderOne({ self, prefix: "" });
	let cause = match(value(self))({ Some: causeOf, None: () => undefined });

	while (cause !== undefined && !printed.has(cause)) {
		printed.add(cause);
		lines.push(...renderOne({ self: cause, prefix: "caused by " }));
		cause = match(value(cause))({ Some: causeOf, None: () => undefined });
	}

	return lines.join("\n");
}
