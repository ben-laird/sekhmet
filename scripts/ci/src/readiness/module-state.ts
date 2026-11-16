import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/**
 * The source directories whose modules must hold no module-level mutable
 * state: a schema is described by its own params, never by a registry.
 * Test files are exempt.
 */
export const STATELESS_ROOTS: readonly string[] = ["packages/schema/src"];

/**
 * Top-level declarations that hold mutable state, matched on the source's
 * structure view (comments and string contents blanked), at column 0 as
 * Biome formats a top-level statement:
 *
 * - a `let` or `var`, which can be reassigned;
 * - a `const` initialised with `new Map`, `new Set`, `new WeakMap` or
 *   `new WeakSet`, a registry by construction (a type annotation may sit
 *   between the name and `=`, over several lines).
 *
 * Deliberately conservative: a `const` array or object that is mutated
 * later, or state hidden behind a function, is not caught.
 */
const STATE_PATTERNS: readonly { pattern: RegExp; what: string }[] = [
	{
		pattern: /^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)/gm,
		what: "a top-level let/var",
	},
	{
		pattern:
			/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)[^=]*=\s*new\s+(?:Weak)?(?:Map|Set)\b/gm,
		what: "a top-level Map/Set registry",
	},
];

/** Whether a path is non-test source under a {@linkcode STATELESS_ROOTS} root. */
export function isStatelessSource(path: string): boolean {
	return (
		path.endsWith(".ts") &&
		!path.endsWith(".test.ts") &&
		STATELESS_ROOTS.some((root) => path.startsWith(`${root}/`))
	);
}

/**
 * Reports each top-level declaration of mutable state in a module (see
 * {@linkcode STATE_PATTERNS} for what counts, and what doesn't).
 */
export function checkModuleState({
	path,
	text,
	views,
}: {
	path: string;
	text: string;
	views: SourceViews;
}): Finding[] {
	return STATE_PATTERNS.flatMap(({ pattern, what }) => {
		return [...views.structure.matchAll(pattern)].map((match) => ({
			check: "module-state" as const,
			file: path,
			line: lineAt({ text, index: match.index }),
			message: `${what} (${match[1]}) is module-level mutable state; carry it in a value (a schema's params) instead`,
		}));
	});
}
