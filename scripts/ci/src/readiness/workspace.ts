import { dirname, join, normalize } from "@std/path/posix";
import type { Finding } from "./finding.ts";
import { lineAt } from "./source.ts";

/**
 * The repo's text files the checks read, keyed by repo-relative POSIX path.
 * The runner gathers it; the checks never touch the filesystem.
 */
export type WorkspaceFiles = ReadonlyMap<string, string>;

/**
 * The parts of a `deno.json` the checks read.
 */
export interface Manifest {
	/** Package name, e.g. `@sekhmet/enum` */
	name?: string;
	/** SPDX license id */
	license?: string;
	/** `false` when the package is never published */
	publish: boolean;
	/** `publish.exclude` globs */
	publishExclude: string[];
	/** Export map: subpath (`.`, `./core`) to a path relative to the manifest */
	exports: Record<string, string>;
	/** Workspace member globs (root manifest only), e.g. `./packages/*` */
	workspace: string[];
}

/**
 * A workspace member: a directory with a parsed `deno.json`.
 */
export interface Member {
	/** Repo-relative directory, e.g. `packages/enum` */
	dir: string;
	/** Repo-relative path of its `deno.json` */
	manifestPath: string;
	/** The raw manifest text, for line numbers */
	manifestText: string;
	/** The parsed manifest */
	manifest: Manifest;
}

/**
 * A value, or the finding that explains why it could not be produced.
 */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: Finding };

/**
 * Parses a `deno.json` text into a {@linkcode Manifest}.
 */
export function parseManifest({
	path,
	text,
}: {
	path: string;
	text: string;
}): Parsed<Manifest> {
	const json = parseJson(text);
	const invalid = (message: string): Parsed<Manifest> => ({
		ok: false,
		error: { check: "exports", file: path, message },
	});
	if (!json.ok) return invalid(`invalid JSON: ${json.error}`);
	if (!isRecord(json.value)) return invalid("expected a JSON object");
	const { name, license, publish, exports, workspace } = json.value;

	const exportMap: Record<string, string> = {};
	if (typeof exports === "string") {
		exportMap["."] = exports;
	} else if (isRecord(exports)) {
		for (const [key, value] of Object.entries(exports)) {
			if (typeof value !== "string") {
				return invalid(`"exports" entry "${key}" is not a path string`);
			}
			exportMap[key] = value;
		}
	} else if (exports !== undefined) {
		return invalid(`"exports" must be a path or an object of paths`);
	}

	return {
		ok: true,
		value: {
			...(typeof name === "string" ? { name } : {}),
			...(typeof license === "string" ? { license } : {}),
			publish: publish !== false,
			publishExclude: strings(isRecord(publish) ? publish.exclude : undefined),
			exports: exportMap,
			workspace: strings(workspace),
		},
	};
}

/**
 * The directories that hold workspace members, from the root manifest's
 * `workspace` globs: `./packages/*` gives `packages`.
 */
export function memberRoots(root: Manifest): string[] {
	return root.workspace
		.filter((glob) => glob.endsWith("/*"))
		.map((glob) => normalize(glob.slice(0, -2)));
}

/**
 * The workspace members whose `deno.json` sits directly in a subdirectory of
 * one of the given directories (e.g. `packages`), with any manifest that
 * does not parse reported as a finding.
 */
export function membersUnder({
	files,
	roots,
}: {
	files: WorkspaceFiles;
	roots: readonly string[];
}): { members: Member[]; findings: Finding[] } {
	const members: Member[] = [];
	const findings: Finding[] = [];
	for (const [path, text] of files) {
		const dir = dirname(path);
		if (!path.endsWith("/deno.json") || !roots.includes(dirname(dir))) {
			continue;
		}
		const parsed = parseManifest({ path, text });
		if (!parsed.ok) {
			findings.push(parsed.error);
			continue;
		}
		members.push({
			dir,
			manifestPath: path,
			manifestText: text,
			manifest: parsed.value,
		});
	}
	members.sort((a, b) => a.dir.localeCompare(b.dir));
	return { members, findings };
}

/**
 * The repo-relative path of a member-relative path such as an export target.
 */
export function memberPath({
	member,
	path,
}: {
	member: Member;
	path: string;
}): string {
	return normalize(join(member.dir, path));
}

/**
 * The 1-based line of the first `"key":` in a JSON text, if present.
 */
export function lineOfKey({
	text,
	key,
}: {
	text: string;
	key: string;
}): number | undefined {
	const index = text.indexOf(`${JSON.stringify(key)}:`);
	return index < 0 ? undefined : lineAt({ text, index });
}

function parseJson(
	text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item) => typeof item === "string")
		: [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
