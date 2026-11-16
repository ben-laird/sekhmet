/**
 * Which lines of a markdown file `deno test --doc` checks, and whether a
 * staged change to the file touches them. The commit gate exempts a
 * markdown-only commit only when it touches none.
 *
 * What counts as a **runnable fence** mirrors Deno 2.9.8, probed directly:
 * - only backtick fences (three or more, indentation allowed); `~~~` fences
 *   are not fences to Deno, so a backtick fence nested in one still runs
 * - the language is the first whitespace-separated word right after the
 *   backticks, matched exactly: {@linkcode RUNNABLE_LANGUAGES}
 * - a later word `ignore` skips the block; `no-eval` is still type-checked
 *
 * An unclosed runnable fence runs to the end of the file here (Deno skips
 * it), so closing it later cannot slip through as prose.
 *
 * @module
 */

/** Languages whose fenced blocks `deno test --doc` type-checks or runs. */
export const RUNNABLE_LANGUAGES: ReadonlySet<string> = new Set([
	"ts",
	"tsx",
	"typescript",
	"mts",
	"cts",
	"js",
	"jsx",
	"javascript",
	"mjs",
	"cjs",
]);

const OPENING_FENCE = /^[ \t]*(`{3,})(.*)$/;
const CLOSING_FENCE = /^[ \t]*(`{3,})[ \t]*$/;

/**
 * Whether a fence's info string (the text after its backticks) makes the
 * block runnable.
 *
 * @param info - The info string, untrimmed
 * @returns true for a runnable language without an `ignore` word
 */
export function isRunnableInfo(info: string): boolean {
	const [language = "", ...words] = info.split(/[ \t]+/);
	return RUNNABLE_LANGUAGES.has(language) && !words.includes("ignore");
}

/**
 * The 1-based numbers of every line inside a runnable fence, its opening and
 * closing fence lines included (editing a fence's info string can make it
 * runnable or not).
 *
 * @param markdown - The file's text
 * @returns The line numbers
 */
export function runnableFenceLines(markdown: string): ReadonlySet<number> {
	const lines = new Set<number>();
	let open: { length: number; runnable: boolean } | undefined;
	for (const [index, line] of markdown.split("\n").entries()) {
		const number = index + 1;
		if (open === undefined) {
			const match = OPENING_FENCE.exec(line);
			const [, ticks = "", info = ""] = match ?? [];
			if (match === null || info.includes("`")) continue;
			open = { length: ticks.length, runnable: isRunnableInfo(info) };
			if (open.runnable) lines.add(number);
			continue;
		}
		if (open.runnable) lines.add(number);
		const [, closing = ""] = CLOSING_FENCE.exec(line) ?? [];
		if (closing.length >= open.length) open = undefined;
	}
	return lines;
}

/** The lines a change removes (old numbering) and adds (new numbering). */
export interface ChangedLines {
	/** 1-based line numbers in the old version */
	removed: readonly number[];
	/** 1-based line numbers in the new version */
	added: readonly number[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function range({
	start,
	count,
}: {
	start: string;
	count: string | undefined;
}): number[] {
	const first = Number(start);
	return Array.from({ length: Number(count ?? "1") }, (_, i) => first + i);
}

/**
 * Parses the hunk headers of a zero-context unified diff (`git diff -U0`)
 * into the lines it removes and adds.
 *
 * @param diff - The diff's text
 * @returns The changed lines
 */
export function parseChangedLines(diff: string): ChangedLines {
	const removed: number[] = [];
	const added: number[] = [];
	for (const line of diff.split("\n")) {
		const match = HUNK_HEADER.exec(line);
		if (match === null) continue;
		const [, oldStart = "", oldCount, newStart = "", newCount] = match;
		removed.push(...range({ start: oldStart, count: oldCount }));
		added.push(...range({ start: newStart, count: newCount }));
	}
	return { removed, added };
}

/**
 * Whether a change to a markdown file touches code `deno test --doc` checks:
 * a removed line inside a runnable fence of the old version, or an added
 * line inside one of the new version. An absent version is empty text.
 *
 * @param options.before - The file at `HEAD`
 * @param options.after - The file in the index
 * @param options.changed - The lines the change removes and adds
 * @returns true when the change touches a runnable block
 */
export function touchesRunnableCode({
	before,
	after,
	changed,
}: {
	before: string;
	after: string;
	changed: ChangedLines;
}): boolean {
	const oldCode = runnableFenceLines(before);
	const newCode = runnableFenceLines(after);
	return (
		changed.removed.some((line) => oldCode.has(line)) ||
		changed.added.some((line) => newCode.has(line))
	);
}
