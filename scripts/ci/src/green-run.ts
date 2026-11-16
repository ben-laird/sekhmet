/**
 * The commit gate's domain: a **green run** is a `deno task ci` run in which
 * every step passed and which checked exactly the staged tree, recorded as
 * that tree's id in the **green marker** (`$(git rev-parse --git-path
 * ci-green)`). A commit is let through when its staged tree has a green run,
 * or when it changes markdown files only.
 *
 * Everything here is pure; `git.ts` gathers the inputs.
 *
 * @module
 */
import type { StepResult } from "./types.ts";

declare const treeIdBrand: unique symbol;

/** A git tree object id, as `git write-tree` prints it (SHA-1 or SHA-256). */
export type TreeId = string & { readonly [treeIdBrand]: true };

const TREE_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Whether a string is a {@linkcode TreeId}.
 *
 * @param text - The candidate, already trimmed
 * @returns true for 40 or 64 lowercase hex digits
 */
export function isTreeId(text: string): text is TreeId {
	return TREE_ID.test(text);
}

/**
 * Parses a tree id from command output or the green marker's text.
 *
 * @param text - The text, with or without surrounding whitespace
 * @returns The id, or `undefined` when the text is not one
 */
export function parseTreeId(text: string): TreeId | undefined {
	const trimmed = text.trim();
	return isTreeId(trimmed) ? trimmed : undefined;
}

/** How the working tree differs from the index. */
export interface WorktreeDrift {
	/** Tracked paths whose working-tree content differs from the index */
	unstaged: readonly string[];
	/** Untracked paths that git does not ignore */
	untracked: readonly string[];
}

/**
 * The index and how far the working tree has drifted from it, at one moment.
 */
export interface StagedSnapshot extends WorktreeDrift {
	/** The staged tree: `git write-tree` of the index */
	tree: TreeId;
}

/**
 * Parses `git status --porcelain=v1 -z --untracked-files=all` into the
 * working tree's {@linkcode WorktreeDrift}. Each entry is `XY path`; a rename
 * or copy in the index (`X` is `R` or `C`) is followed by its source path.
 * `Y` other than a space is a working-tree change; `??` is untracked.
 *
 * @param porcelain - The command's output
 * @returns The unstaged and untracked paths
 */
export function parseStatus(porcelain: string): WorktreeDrift {
	const unstaged: string[] = [];
	const untracked: string[] = [];
	const fields = porcelain.split("\0");
	for (let i = 0; i < fields.length; i++) {
		const entry = fields[i] ?? "";
		if (entry.length < 4) continue;
		const x = entry[0];
		const y = entry[1];
		const path = entry.slice(3);
		if (x === "?" && y === "?") {
			untracked.push(path);
		} else if (y !== " ") {
			unstaged.push(path);
		}
		if (x === "R" || x === "C") i++;
	}
	return { unstaged, untracked };
}

/** A fallible result: errors are values. */
export type Result<T, E = string> =
	| { ok: true; value: T }
	| { ok: false; error: E };

/**
 * Whether a finished gate run is recorded as green:
 * - `record`: write `tree` to the green marker
 * - `skip`: leave the marker alone, for `reason`
 */
export type GreenRunDecision =
	| { kind: "record"; tree: TreeId }
	| { kind: "skip"; reason: string };

const LISTED_PATHS = 3;

function listPaths(paths: readonly string[]): string {
	const shown = paths.slice(0, LISTED_PATHS).join(", ");
	const more = paths.length - LISTED_PATHS;
	return more > 0 ? `${shown} and ${more} more` : shown;
}

function drift(snapshot: StagedSnapshot): string | undefined {
	if (snapshot.unstaged.length > 0) {
		return `unstaged changes to ${listPaths(snapshot.unstaged)}`;
	}
	if (snapshot.untracked.length > 0) {
		return `untracked ${listPaths(snapshot.untracked)}`;
	}
	return undefined;
}

/**
 * Decides whether a gate run is green for the staged tree. The gate checks
 * the working tree, not the index, so it vouches for the staged tree only
 * when the two hold the same files: no tracked file differs from the index,
 * and no untracked, unignored file exists (the gate's tools scan the whole
 * tree, so any such file could change its verdict). That must hold both
 * before the first step and after the last, with the same staged tree, so an
 * edit or a `git add` during the run is caught. Ignored files are never
 * committed, so they are out of scope.
 *
 * @param options.steps - Every step's result
 * @param options.before - The snapshot taken before any step ran
 * @param options.after - The snapshot taken after every step finished
 * @returns Whether to record the run, and why not
 */
export function greenRunDecision({
	steps,
	before,
	after,
}: {
	steps: readonly StepResult[];
	before: Result<StagedSnapshot>;
	after: Result<StagedSnapshot>;
}): GreenRunDecision {
	const unhealthy = steps.filter(
		(step) => step.status === "failed" || step.status === "blocked",
	);
	if (unhealthy.length > 0) {
		const names = listPaths(unhealthy.map((step) => `"${step.name}"`));
		return { kind: "skip", reason: `${names} did not pass` };
	}
	if (!before.ok) {
		return { kind: "skip", reason: `no staged tree: ${before.error}` };
	}
	const driftBefore = drift(before.value);
	if (driftBefore !== undefined) {
		return {
			kind: "skip",
			reason: `the gate checked the working tree, which had ${driftBefore}`,
		};
	}
	if (!after.ok) {
		return { kind: "skip", reason: `no staged tree: ${after.error}` };
	}
	const driftAfter = drift(after.value);
	if (after.value.tree !== before.value.tree || driftAfter !== undefined) {
		return {
			kind: "skip",
			reason: "the index or working tree changed during the run",
		};
	}
	return { kind: "record", tree: before.value.tree };
}

/** What the commit is: an ordinary commit, or a merge commit. */
export type CommitKind = "commit" | "merge";

/**
 * Whether a commit may go ahead:
 * - `allow`, because its staged tree has a green run (`green`), every staged
 *   path is markdown (`markdown-only`), or it stages no change against
 *   `HEAD` (`unchanged`: its tree is one already committed)
 * - `refuse`, with the message the hook prints
 */
export type CommitVerdict =
	| { kind: "allow"; reason: "green" | "markdown-only" | "unchanged" }
	| { kind: "refuse"; message: string };

/**
 * Decides whether a commit (or merge commit) may go ahead.
 *
 * @param options.staged - The staged tree being committed
 * @param options.green - The tree in the green marker, if any
 * @param options.stagedPaths - Paths that differ between `HEAD` and the index
 * @param options.kind - Whether this is a merge commit (default: `commit`)
 * @returns The verdict
 */
export function commitVerdict({
	staged,
	green,
	stagedPaths,
	kind = "commit",
}: {
	staged: TreeId;
	green: TreeId | undefined;
	stagedPaths: readonly string[];
	kind?: CommitKind;
}): CommitVerdict {
	if (staged === green) return { kind: "allow", reason: "green" };
	if (stagedPaths.length === 0) return { kind: "allow", reason: "unchanged" };
	if (stagedPaths.every((path) => path.endsWith(".md"))) {
		return { kind: "allow", reason: "markdown-only" };
	}
	const next =
		kind === "merge"
			? "the merge is staged: run `deno task ci`, then `git commit`"
			: "run it, then commit";
	return {
		kind: "refuse",
		message: `staged tree ${staged} has no green \`deno task ci\` run; ${next}`,
	};
}

/** The `core.hooksPath` that turns the commit gate on. */
export const HOOKS_PATH = ".githooks";

/**
 * The warning `deno task ci` prints when this clone does not run the commit
 * gate's hooks.
 *
 * @param hooksPath - The configured `core.hooksPath`, if any
 * @returns The one-line warning, or `undefined` when the hooks are on
 */
export function hooksWarning(
	hooksPath: string | undefined,
): string | undefined {
	return hooksPath === HOOKS_PATH
		? undefined
		: "warning: commits are not gated in this clone (core.hooksPath is not .githooks); run `deno task hooks` once";
}
