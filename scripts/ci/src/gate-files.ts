/**
 * A gate tool that is handed the files git does not ignore, instead of
 * walking the tree, so gitignored scratch (`playground/`) never reaches it:
 * - `biome`: `biome ci`, over every such file (`files.ignoreUnknown` skips
 *   the ones Biome does not handle)
 * - `check`: `deno check`, over the TypeScript and JavaScript ones (it has no
 *   `check.exclude`, and the root `exclude` would also hide `playground/`
 *   from the language server)
 */
export type GateTool = "biome" | "check";

/** The files a {@linkcode GateTool} runs over, or why there are none. */
export type GateFiles =
	| { ok: true; paths: string[] }
	| { ok: false; error: string };

/** The extensions `deno check` type-checks when it walks the tree. */
const CHECKED_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
];

/**
 * The files a gate tool runs over: every file git does not ignore (tracked,
 * or untracked but not gitignored), minus tracked files deleted from the
 * working tree, which the tool would fail to read; for `check`, only the
 * TypeScript and JavaScript ones.
 *
 * An empty list is an error: either tool, given no paths, walks the whole
 * tree, gitignored scratch included.
 *
 * @param options.tool - The tool the files are for
 * @param options.listed - `git ls-files -z --cached --others --exclude-standard` output
 * @param options.deleted - `git ls-files -z --deleted` output
 * @returns The sorted, distinct paths, or an error
 */
export function gateFiles({
	tool,
	listed,
	deleted,
}: {
	tool: GateTool;
	listed: string;
	deleted: string;
}): GateFiles {
	const gone = new Set(splitNul(deleted));
	const paths = [...new Set(splitNul(listed))]
		.filter((path) => !gone.has(path))
		.filter((path) => tool === "biome" || isChecked(path))
		.sort();
	return paths.length === 0
		? { ok: false, error: `git lists no files for ${tool} to check` }
		: { ok: true, paths };
}

function isChecked(path: string): boolean {
	return CHECKED_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function splitNul(output: string): string[] {
	return output.split("\0").filter((path) => path !== "");
}
