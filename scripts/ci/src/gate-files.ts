/**
 * A gate tool that is handed the paths git does not ignore, instead of
 * walking the tree, so gitignored scratch (`playground/`) never reaches it
 * while the editor and a hand-run `deno lint`/`deno test` still cover it:
 * - `biome`: `biome ci`, over every such file (`files.ignoreUnknown` skips
 *   the ones Biome does not handle)
 * - `check`: `deno check`, over the TypeScript and JavaScript ones (it has no
 *   `check.exclude`, and the root `exclude` would also hide `playground/`
 *   from the language server)
 * - `lint`: `deno lint`, over the same TypeScript and JavaScript files
 * - `test`: `deno test`, over the top-level entries those files live in (see
 *   {@linkcode gateFiles})
 */
export type GateTool = "biome" | "check" | "lint" | "test";

/** The paths a {@linkcode GateTool} runs over, or why there are none. */
export type GateFiles =
	| { ok: true; paths: string[] }
	| { ok: false; error: string };

/**
 * The extensions `deno check` and `deno lint` read when they walk the tree,
 * which are also the extensions of a `deno test` test module.
 */
const CODE_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
];

/** The extensions `deno test --doc` reads as markdown. */
const MARKDOWN_EXTENSIONS = [
	".md",
	".markdown",
	".mkd",
	".mkdn",
	".mdwn",
	".mdown",
];

/**
 * The paths a gate tool runs over, from the files git does not ignore
 * (tracked, or untracked but not gitignored) minus tracked files deleted from
 * the working tree, which the tool would fail to read:
 * - `biome`: every such file
 * - `check` and `lint`: the TypeScript and JavaScript ones
 * - `test`: the top-level directories those files live in, plus the
 *   top-level files `deno test --doc` would pick up on its own walk (test
 *   modules and markdown). Directories, not files, because `deno test` runs
 *   any file it is handed as a test module, executing (and covering) modules
 *   its walk would only doc-test; within a directory it keeps its own
 *   discovery and the `deno.json` excludes. A root-level module that is not
 *   a test is left out for the same reason, so its JSDoc examples go
 *   untested; a gitignored path nested in a listed directory is still walked.
 *
 * An empty list is an error: every tool, given no paths, walks the whole
 * tree, gitignored scratch included.
 *
 * @param options.tool - The tool the paths are for
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
	const present = splitNul(listed).filter((path) => !gone.has(path));
	const paths = [...new Set(pathsFor({ tool, files: present }))].sort();
	return paths.length === 0
		? { ok: false, error: `git lists no files for ${tool} to run over` }
		: { ok: true, paths };
}

function pathsFor({
	tool,
	files,
}: {
	tool: GateTool;
	files: string[];
}): string[] {
	switch (tool) {
		case "biome":
			return files;
		case "check":
		case "lint":
			return files.filter(isCode);
		case "test":
			return files.flatMap(testRoot);
	}
}

/** The top-level entry `deno test` is handed for a file, if any. */
function testRoot(path: string): string[] {
	const slash = path.indexOf("/");
	if (slash !== -1) return [path.slice(0, slash)];
	return isTestModule(path) || hasExtension({ path, of: MARKDOWN_EXTENSIONS })
		? [path]
		: [];
}

/** Deno's test-module name: `{*_,*.,}test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`. */
function isTestModule(path: string): boolean {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return CODE_EXTENSIONS.some(
		(extension) =>
			name === `test${extension}` ||
			name.endsWith(`.test${extension}`) ||
			name.endsWith(`_test${extension}`),
	);
}

function isCode(path: string): boolean {
	return hasExtension({ path, of: CODE_EXTENSIONS });
}

function hasExtension({
	path,
	of,
}: {
	path: string;
	of: readonly string[];
}): boolean {
	return of.some((extension) => path.endsWith(extension));
}

function splitNul(output: string): string[] {
	return output.split("\0").filter((path) => path !== "");
}

/** Every {@linkcode GateTool}, in the order the usage line lists them. */
export const GATE_TOOLS: readonly GateTool[] = [
	"biome",
	"check",
	"lint",
	"test",
];

/**
 * Whether a command-line argument names a {@linkcode GateTool}.
 *
 * @param value - The argument
 * @returns true for one of {@linkcode GATE_TOOLS}
 */
export function isGateTool(value: unknown): value is GateTool {
	return GATE_TOOLS.some((tool) => tool === value);
}
