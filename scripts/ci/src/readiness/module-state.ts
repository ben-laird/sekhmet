import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/**
 * The source directories whose modules must hold no module-level mutable
 * state: a schema is described by its own params, never by a registry.
 * Test files are exempt.
 */
export const STATELESS_ROOTS: readonly string[] = ["packages/schema/src"];

/** The constructors whose instances are mutable registries or holders. */
const MUTABLE_CONSTRUCTORS: readonly string[] = [
	"Map",
	"Set",
	"WeakMap",
	"WeakSet",
	"Array",
	"WeakRef",
	"FinalizationRegistry",
];

/**
 * A `new` of a {@linkcode MUTABLE_CONSTRUCTORS} constructor, bare or through
 * `globalThis`, right after an `=` that is not part of `=>`.
 */
const MUTABLE_INITIALISER: RegExp = new RegExp(
	`(?<![=!<>])=(?![=>])\\s*new\\s+(?:globalThis\\s*\\.\\s*)?(?:${MUTABLE_CONSTRUCTORS.join("|")})\\b`,
);

/** A top-level declaration or a class's static field. */
interface Declaration {
	/** Where it starts in the source. */
	readonly index: number;
	/** Its name, or its destructuring pattern. */
	readonly name: string;
	/** Its text up to the next top-level statement. */
	readonly text: string;
}

/** The declarations `pattern` matches, each with its text to the next statement. */
function declarations({
	structure,
	pattern,
}: {
	structure: string;
	pattern: RegExp;
}): Declaration[] {
	return [...structure.matchAll(pattern)].map((match) => {
		const rest = structure.slice(match.index);
		const next = rest.slice(1).search(/\n(?=[^\s)\]}])/);
		const text = next === -1 ? rest : rest.slice(0, next + 1);

		return { index: match.index, name: match[1] ?? "", text };
	});
}

/**
 * A top-level `let` or `var` (a name, or an object or array pattern),
 * which can be reassigned.
 */
const MUTABLE_BINDING: RegExp =
	/^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])/gm;

/** A top-level `const`, whose initialiser decides whether it holds state. */
const CONSTANT: RegExp = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)/gm;

/**
 * A class's `static` field that isn't `readonly`, which can be reassigned
 * (a method, getter or setter is not a field).
 */
const STATIC_FIELD: RegExp =
	/^[ \t]+static\s+(?!readonly\b|get\b|set\b|async\b)(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*[:=;]/gm;

/**
 * Reports each declaration of module-level mutable state in a module,
 * matched on the source's structure view (comments and string contents
 * blanked), as Biome formats it:
 *
 * - a top-level `let` or `var`, by name or by destructuring pattern;
 * - a top-level `const` initialised with `new` of a mutable constructor
 *   (`Map`, `Set`, `WeakMap`, `WeakSet`, `Array`, `WeakRef`,
 *   `FinalizationRegistry`, also through `globalThis`), whatever its type
 *   annotation (`=>` and defaulted type parameters included);
 * - a class's `static` field that isn't `readonly`.
 *
 * Deliberately conservative, it misses state it can't see syntactically: a
 * `const` array or object literal that is mutated later, a registry built
 * by a factory or an IIFE (`const r = makeRegistry()`), or one behind any
 * expression other than a bare `new`.
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
	const { structure } = views;
	const found = [
		...declarations({ structure, pattern: MUTABLE_BINDING }).map((at) => ({
			at,
			what: "a top-level let/var",
		})),
		...declarations({ structure, pattern: CONSTANT })
			.filter(({ text: declared }) => MUTABLE_INITIALISER.test(declared))
			.map((at) => ({ at, what: "a top-level mutable registry" })),
		...declarations({ structure, pattern: STATIC_FIELD }).map((at) => ({
			at,
			what: "a static field",
		})),
	];

	return found
		.sort((a, b) => a.at.index - b.at.index)
		.map(({ at, what }) => ({
			check: "module-state",
			file: path,
			line: lineAt({ text, index: at.index }),
			message: `${what} (${at.name}) is module-level mutable state; carry it in a value (a schema's params) instead`,
		}));
}

/** Whether a path is non-test source under a {@linkcode STATELESS_ROOTS} root. */
export function isStatelessSource(path: string): boolean {
	return (
		path.endsWith(".ts") &&
		!path.endsWith(".test.ts") &&
		STATELESS_ROOTS.some((root) => path.startsWith(`${root}/`))
	);
}
