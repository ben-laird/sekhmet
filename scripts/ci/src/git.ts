/**
 * The commit gate's git edge: each function runs `git` and returns its
 * answer as a {@linkcode Result}, for the pure decisions in `green-run.ts`.
 *
 * Commands inherit the environment, so inside a hook they see the index git
 * is committing (`GIT_INDEX_FILE`), and in a linked worktree its own index
 * and git dir.
 *
 * @module
 */
import {
	parseStatus,
	parseTreeId,
	type Result,
	type StagedSnapshot,
	type TreeId,
} from "./green-run.ts";
import { parseChangedLines, touchesRunnableCode } from "./markdown-code.ts";

/** Where git runs: a directory in the repository (default: the cwd). */
export interface GitOptions {
	/** The directory to run git in */
	cwd?: string;
}

/**
 * Runs `git` with the given arguments.
 *
 * @param options.args - The arguments
 * @param options.cwd - The directory to run in (default: the cwd)
 * @returns Its stdout, or its stderr when it exits non-zero
 */
export async function git({
	args,
	cwd,
}: GitOptions & { args: readonly string[] }): Promise<Result<string>> {
	const command = new Deno.Command("git", {
		args: [...args],
		stdin: "null",
		stdout: "piped",
		stderr: "piped",
		...(cwd === undefined ? {} : { cwd }),
	});
	const output = await command.output();
	const decoder = new TextDecoder();
	return output.success
		? { ok: true, value: decoder.decode(output.stdout) }
		: {
				ok: false,
				error: `git ${args.join(" ")}: ${decoder.decode(output.stderr).trim()}`,
			};
}

/**
 * The staged tree: `git write-tree` of the index.
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The tree id, or why there is none (e.g. unmerged paths)
 */
export async function stagedTree({
	cwd,
}: GitOptions = {}): Promise<Result<TreeId>> {
	const output = await git({ args: ["write-tree"], ...cwdOf(cwd) });
	if (!output.ok) return output;
	const tree = parseTreeId(output.value);
	return tree === undefined
		? { ok: false, error: `git write-tree printed ${output.value.trim()}` }
		: { ok: true, value: tree };
}

/**
 * The staged tree and how the working tree has drifted from the index.
 * `--no-optional-locks` keeps `git status` from rewriting the index, which a
 * concurrent git command may hold.
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The snapshot, or why it could not be taken
 */
export async function stagedSnapshot({
	cwd,
}: GitOptions = {}): Promise<Result<StagedSnapshot>> {
	const tree = await stagedTree(cwdOf(cwd));
	if (!tree.ok) return tree;
	const status = await git({
		args: [
			"--no-optional-locks",
			"status",
			"--porcelain=v1",
			"-z",
			"--untracked-files=all",
		],
		...cwdOf(cwd),
	});
	if (!status.ok) return status;
	return {
		ok: true,
		value: { tree: tree.value, ...parseStatus(status.value) },
	};
}

/**
 * The paths that differ between `HEAD` and the index, with renames split
 * into a deletion and an addition so both paths count. On an unborn branch
 * every path in the index counts.
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The paths
 */
export async function stagedPaths({
	cwd,
}: GitOptions = {}): Promise<Result<string[]>> {
	const head = await git({
		args: ["rev-parse", "--verify", "--quiet", "HEAD"],
		...cwdOf(cwd),
	});
	const args = head.ok
		? ["diff", "--cached", "--name-only", "--no-renames", "-z"]
		: ["ls-files", "-z"];
	const output = await git({ args, ...cwdOf(cwd) });
	if (!output.ok) return output;
	return {
		ok: true,
		value: output.value.split("\0").filter((path) => path.length > 0),
	};
}

/**
 * The staged markdown paths whose change touches a block `deno test --doc`
 * runs, judged from `HEAD`'s and the index's version of each and their
 * zero-context diff (see `markdown-code.ts`).
 *
 * @param options.paths - The staged markdown paths
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The paths that touch runnable code
 */
export async function markdownWithCode({
	paths,
	cwd,
}: GitOptions & { paths: readonly string[] }): Promise<Result<string[]>> {
	const touching: string[] = [];
	for (const path of paths) {
		const [before, after, diff] = await Promise.all([
			blob({ spec: `HEAD:${path}`, cwd }),
			blob({ spec: `:${path}`, cwd }),
			git({
				args: [
					"diff",
					"--cached",
					"-U0",
					"--no-color",
					"--no-ext-diff",
					"--no-textconv",
					"--no-renames",
					"--",
					path,
				],
				...cwdOf(cwd),
			}),
		]);
		if (!before.ok) return before;
		if (!after.ok) return after;
		if (!diff.ok) return diff;
		const changed = parseChangedLines(diff.value);
		if (
			touchesRunnableCode({ before: before.value, after: after.value, changed })
		) {
			touching.push(path);
		}
	}
	return { ok: true, value: touching };
}

/** A blob's text, or `""` when the object does not exist (a new file). */
async function blob({
	spec,
	cwd,
}: {
	spec: string;
	cwd: string | undefined;
}): Promise<Result<string>> {
	const exists = await git({
		args: ["rev-parse", "--verify", "--quiet", spec],
		...cwdOf(cwd),
	});
	if (!exists.ok) return { ok: true, value: "" };
	return await git({ args: ["show", spec], ...cwdOf(cwd) });
}

/**
 * This clone's `core.hooksPath`.
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The configured path, or `undefined` when it is not set
 */
export async function hooksPath({
	cwd,
}: GitOptions = {}): Promise<string | undefined> {
	const output = await git({
		args: ["config", "--get", "core.hooksPath"],
		...cwdOf(cwd),
	});
	return output.ok ? output.value.trim() : undefined;
}

/**
 * The green marker's path: `ci-green` in this worktree's git dir, as an
 * absolute path. Linked worktrees each have their own (as they do an index).
 *
 * @param options.cwd - A directory in the repository (default: the cwd)
 * @returns The path
 */
export async function greenMarkerPath({
	cwd,
}: GitOptions = {}): Promise<Result<string>> {
	const output = await git({
		args: ["rev-parse", "--path-format=absolute", "--git-path", "ci-green"],
		...cwdOf(cwd),
	});
	return output.ok ? { ok: true, value: output.value.trim() } : output;
}

/**
 * The tree id in the green marker.
 *
 * @param path - The marker's path
 * @returns The id, or `undefined` when there is no marker or it holds no id
 */
export async function readGreenMarker(
	path: string,
): Promise<TreeId | undefined> {
	try {
		return parseTreeId(await Deno.readTextFile(path));
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

/**
 * Records a green run for a tree in the green marker.
 *
 * @param options.path - The marker's path
 * @param options.tree - The staged tree the run checked
 * @returns Nothing, or why the marker could not be written
 */
export async function writeGreenMarker({
	path,
	tree,
}: {
	path: string;
	tree: TreeId;
}): Promise<Result<undefined>> {
	try {
		await Deno.writeTextFile(path, `${tree}\n`);
		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `cannot write ${path}: ${String(error)}` };
	}
}

function cwdOf(cwd: string | undefined): GitOptions {
	return cwd === undefined ? {} : { cwd };
}
