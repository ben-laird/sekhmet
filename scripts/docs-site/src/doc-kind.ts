/**
 * The four kinds of documentation in [Diátaxis](https://diataxis.fr): each
 * page serves exactly one reader need, and declares which in its frontmatter
 * (`kind: tutorial`).
 *
 * @module
 */

import { err, ok, type Result } from "./result.ts";

/**
 * A page's Diátaxis kind: a lesson (`tutorial`), a recipe for a task
 * (`how-to`), background and reasoning (`explanation`), or a description of
 * the machinery (`reference`).
 */
export type DocKind = "tutorial" | "how-to" | "explanation" | "reference";

/** Every kind, in the order a package's sidebar shows them. */
export const DOC_KINDS: readonly DocKind[] = [
	"tutorial",
	"how-to",
	"explanation",
	"reference",
];

/** The sidebar heading of each kind's group. */
export const DOC_KIND_HEADINGS: Readonly<Record<DocKind, string>> = {
	tutorial: "Tutorials",
	"how-to": "How-to guides",
	explanation: "Explanation",
	reference: "Reference",
};

/** A `kind` value that names no {@linkcode DocKind}. */
export interface UnknownDocKind {
	/** The value as written. */
	readonly value: string;
}

/** Whether `value` is a {@linkcode DocKind}. */
function isDocKind(value: string): value is DocKind {
	return DOC_KINDS.some((kind) => kind === value);
}

/**
 * Reads a page's kind from its `kind` frontmatter value.
 *
 * @param value - The `kind` value, or `undefined` when the page declares none
 * @returns The kind (`undefined` for an untagged page), or the unknown value
 */
export function parseDocKind(
	value: string | undefined,
): Result<DocKind | undefined, UnknownDocKind> {
	if (value === undefined || isDocKind(value)) return ok(value);
	return err({ value });
}

/**
 * Describes an unknown kind for a build log.
 *
 * @param error - The unknown kind
 * @returns One sentence naming the value and the kinds allowed
 */
export function describeUnknownDocKind(error: UnknownDocKind): string {
	return `unknown kind "${error.value}"; expected one of ${DOC_KINDS.join(", ")}`;
}
