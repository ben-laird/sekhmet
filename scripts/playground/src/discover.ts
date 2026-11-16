/**
 * Discovers the playground's namespaces from workspace package manifests.
 *
 * A package with a root export (`.`) is exposed as one namespace named after
 * the package (`@sekhmet/vow` → `vow`), since its root re-exports its
 * features. A package without one exposes each main feature subpath
 * (`@sekhmet/enum/option` → `option`). `mini` entrypoints and nested
 * subpaths are skipped. A name that two entrypoints share, or that is not a
 * usable identifier, is qualified by its package (`enumCore`).
 *
 * @module
 */

/** The part of a workspace package's `deno.json` the playground reads. */
export interface PackageManifest {
	/** The package name, e.g. `@sekhmet/enum`. */
	readonly name: string;
	/** The export map, subpath (`.` or `./feature`) → module path. */
	readonly exports: Readonly<Record<string, string>>;
}

/** A module the playground imports and binds to a global name. */
export interface Namespace {
	/** The global identifier the module is bound to. */
	readonly name: string;
	/** The bare specifier it is imported from, e.g. `@sekhmet/enum/option`. */
	readonly specifier: string;
}

/** The result of decoding a `deno.json`. */
export type DecodedManifest =
	| { readonly ok: true; readonly value: PackageManifest }
	| { readonly ok: false; readonly error: string };

/**
 * Decodes parsed `deno.json` contents into a {@linkcode PackageManifest}.
 *
 * @param json - The parsed `deno.json`
 * @returns The manifest, or why the contents are not a package with exports
 */
export function decodeManifest(json: unknown): DecodedManifest {
	if (typeof json !== "object" || json === null) {
		return { ok: false, error: "not an object" };
	}
	const name: unknown = Reflect.get(json, "name");
	if (typeof name !== "string") {
		return { ok: false, error: "no `name`" };
	}
	const exports: unknown = Reflect.get(json, "exports");
	if (typeof exports === "string") {
		return { ok: true, value: { name, exports: { ".": exports } } };
	}
	if (typeof exports !== "object" || exports === null) {
		return { ok: false, error: "no `exports`" };
	}

	const entries: [string, string][] = [];
	for (const [subpath, path] of Object.entries(exports)) {
		if (typeof path !== "string") {
			return { ok: false, error: `export \`${subpath}\` is not a path` };
		}
		entries.push([subpath, path]);
	}
	return { ok: true, value: { name, exports: Object.fromEntries(entries) } };
}

const RESERVED: ReadonlySet<string> = new Set([
	"arguments",
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"eval",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"implements",
	"import",
	"in",
	"instanceof",
	"interface",
	"let",
	"new",
	"null",
	"package",
	"private",
	"protected",
	"public",
	"return",
	"static",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",
]);

function camelCase(words: string): string {
	return words.replace(/[-_.]+([a-zA-Z0-9])/g, (_, char: string) =>
		char.toUpperCase(),
	);
}

function isUsable(name: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED.has(name);
}

interface Candidate {
	readonly name: string;
	readonly qualified: string;
	readonly specifier: string;
}

function candidates(manifest: PackageManifest): Candidate[] {
	const short = manifest.name.slice(manifest.name.lastIndexOf("/") + 1);
	const subpaths = Object.keys(manifest.exports);

	if (subpaths.includes(".")) {
		return [
			{
				name: camelCase(short),
				qualified: camelCase(manifest.name.replace(/^@/, "").replace("/", "-")),
				specifier: manifest.name,
			},
		];
	}

	return subpaths.flatMap((subpath) => {
		const feature = /^\.\/([^/]+)$/.exec(subpath)?.[1];
		if (feature === undefined || feature === "mini") return [];
		return [
			{
				name: camelCase(feature),
				qualified: camelCase(`${short}-${feature}`),
				specifier: `${manifest.name}/${feature}`,
			},
		];
	});
}

/**
 * Lists the namespaces the playground exposes for a set of packages, sorted
 * by specifier. Names are unique across the result.
 *
 * @param manifests - Every workspace package to expose
 * @returns One namespace per root or main feature entrypoint
 */
export function discoverNamespaces(
	manifests: readonly PackageManifest[],
): Namespace[] {
	const all = manifests.flatMap(candidates);
	const counts = new Map<string, number>();
	for (const { name } of all) counts.set(name, (counts.get(name) ?? 0) + 1);

	return all
		.map(({ name, qualified, specifier }) => ({
			name: counts.get(name) === 1 && isUsable(name) ? name : qualified,
			specifier,
		}))
		.sort((a, b) => a.specifier.localeCompare(b.specifier));
}
