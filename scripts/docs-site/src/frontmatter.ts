/**
 * Reads a markdown page's frontmatter: a leading `---` block of flat
 * `key: value` lines, the subset of YAML the docs pages use. Anything richer
 * is rejected rather than misread, so a page never silently loses a key.
 *
 * @module
 */

import { err, ok, type Result } from "./result.ts";

/** A page split into its frontmatter fields and its markdown body. */
export interface Frontmatter {
	/** The frontmatter fields, by key; empty when the page has none. */
	readonly fields: Readonly<Record<string, string>>;
	/** The markdown after the frontmatter block. */
	readonly body: string;
}

/** Why a page's frontmatter could not be read. */
export type FrontmatterError =
	| { readonly kind: "unclosed" }
	| { readonly kind: "not-flat"; readonly line: number; readonly text: string }
	| {
			readonly kind: "repeated-key";
			readonly line: number;
			readonly key: string;
	  };

const FENCE = /^---[ \t]*$/;
const FIELD = /^([A-Za-z_][\w-]*):[ \t]*(.*?)[ \t]*$/;
const QUOTED = /^(["'])(.*)\1$/;

/**
 * Splits a markdown page into its frontmatter and body. A page without a
 * leading `---` line has no frontmatter. Blank lines and `#` comments inside
 * the block are skipped; a value may be wrapped in single or double quotes.
 *
 * @param text - The markdown page
 * @returns The fields and body, or why the block is not flat `key: value` lines
 */
export function splitFrontmatter(
	text: string,
): Result<Frontmatter, FrontmatterError> {
	const lines = text.split(/\r?\n/);
	if (!FENCE.test(lines[0] ?? "")) return ok({ fields: {}, body: text });

	const end = lines.findIndex((line, index) => index > 0 && FENCE.test(line));
	if (end < 0) return err({ kind: "unclosed" });

	const fields: Record<string, string> = {};
	for (const [offset, line] of lines.slice(1, end).entries()) {
		if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

		const lineNumber = offset + 2;
		const field = FIELD.exec(line);
		if (field === null) {
			return err({ kind: "not-flat", line: lineNumber, text: line });
		}

		const [, key = "", raw = ""] = field;
		if (Object.hasOwn(fields, key)) {
			return err({ kind: "repeated-key", line: lineNumber, key });
		}
		fields[key] = QUOTED.exec(raw)?.[2] ?? raw;
	}

	return ok({ fields, body: lines.slice(end + 1).join("\n") });
}

/**
 * Describes a frontmatter error for a build log.
 *
 * @param error - The error
 * @returns One sentence naming what is wrong and where
 */
export function describeFrontmatterError(error: FrontmatterError): string {
	switch (error.kind) {
		case "unclosed": {
			return "frontmatter has no closing `---` line";
		}
		case "not-flat": {
			return `frontmatter line ${error.line} is not a flat \`key: value\` line: ${error.text}`;
		}
		case "repeated-key": {
			return `frontmatter line ${error.line} repeats the key \`${error.key}\``;
		}
	}
}
