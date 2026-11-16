import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/**
 * A module specifier in a source text, with the index of its opening quote.
 */
export interface ImportSpecifier {
	/** The specifier, e.g. `@std/assert` */
	specifier: string;
	/** Index of the specifier's opening quote in the source */
	index: number;
}

const IMPORT_PATTERNS: readonly RegExp[] = [
	// import … from "x" / export … from "x"
	/\b(?:import|export)\b[^;"'`]*?\bfrom\s*(["'])([^"'\n]+)\1/g,
	// import "x" (side effect)
	/\bimport\s*(["'])([^"'\n]+)\1/g,
	// import("x") (dynamic)
	/\bimport\s*\(\s*(["'])([^"'\n]+)\1/g,
];

/**
 * Every static, side-effect and dynamic import specifier in code, ignoring
 * comments (the `specifiers` check reads JSDoc examples).
 */
export function importSpecifiers(views: SourceViews): ImportSpecifier[] {
	const found = new Map<number, string>();
	for (const pattern of IMPORT_PATTERNS) {
		for (const match of views.code.matchAll(pattern)) {
			const [whole, quote, specifier] = match;
			if (quote === undefined || specifier === undefined) continue;
			found.set(match.index + whole.lastIndexOf(quote + specifier), specifier);
		}
	}
	return [...found]
		.sort(([a], [b]) => a - b)
		.map(([index, specifier]) => ({ specifier, index }));
}

/**
 * Whether published package source may import a specifier: a relative path,
 * the package-local `@/` alias, a `@sekhmet/*` workspace package, or the
 * Deno standard library (`@std/*`, `jsr:@std/*`).
 */
export function isAllowedImport(specifier: string): boolean {
	return (
		specifier.startsWith("./") ||
		specifier.startsWith("../") ||
		specifier.startsWith("@/") ||
		specifier.startsWith("@sekhmet/") ||
		specifier.startsWith("@std/") ||
		specifier.startsWith("jsr:@std/")
	);
}

/**
 * Package source (not tests) imports only {@linkcode isAllowedImport}
 * specifiers, so a published package has no external dependencies.
 */
export function checkImports({
	path,
	text,
	views,
}: {
	path: string;
	text: string;
	views: SourceViews;
}): Finding[] {
	return importSpecifiers(views)
		.filter(({ specifier }) => !isAllowedImport(specifier))
		.map(({ specifier, index }) => ({
			check: "imports",
			file: path,
			line: lineAt({ text, index }),
			message: `package source imports "${specifier}"; only relative paths, "@/", "@sekhmet/*" and "@std/*" are allowed (no npm:, non-std jsr:, URLs or the repo-root "@~/" alias)`,
		}));
}
