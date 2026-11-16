/**
 * How the commit gate's hooks are turned on. Each branch carries its own
 * hooks in `.githooks/`; a **shim** in the clone's shared hooks directory
 * (`$(git rev-parse --git-common-dir)/hooks`, shared by every worktree) runs
 * the hook of whichever worktree git is committing in, or lets the commit
 * through when that worktree's branch has no such hook.
 *
 * The shims replace `core.hooksPath`, which is one value for every worktree
 * and which tooling may rewrite (Claude Code's worktree setup absolutizes a
 * relative one to the main checkout's). A set `core.hooksPath` makes git
 * ignore the shared hooks directory, so `deno task hooks` unsets it.
 *
 * Everything here is pure; `hooks.ts` at the package root does the I/O.
 *
 * @module
 */

/** The hooks the commit gate runs, each shimmed to `.githooks/<name>`. */
export const HOOK_NAMES: readonly HookName[] = [
	"pre-commit",
	"pre-merge-commit",
];

/** A hook the commit gate runs. */
export type HookName = "pre-commit" | "pre-merge-commit";

/** The directory, relative to a worktree's top level, that holds its hooks. */
export const BRANCH_HOOKS_DIR = ".githooks";

/** The line that marks a hook file as a shim `deno task hooks` installed. */
export const SHIM_MARKER =
	"# sekhmet: commit gate shim, installed by `deno task hooks`";

/**
 * The shim for a hook: runs this worktree's `.githooks/<name>` with the same
 * arguments and environment (`GIT_INDEX_FILE` and all), or exits 0 when the
 * branch has none. It names no absolute path, so it serves every worktree.
 *
 * @param name - The hook
 * @returns The shim's text
 */
export function shimScript(name: HookName): string {
	return [
		"#!/bin/sh",
		SHIM_MARKER,
		`# Runs this worktree's ${BRANCH_HOOKS_DIR}/${name}; a branch without one is not gated.`,
		`hook="$(git rev-parse --show-toplevel)/${BRANCH_HOOKS_DIR}/${name}"`,
		'if [ -f "$hook" ]; then exec "$hook" "$@"; fi',
		"exit 0",
		"",
	].join("\n");
}

/**
 * Whether a hook file is a shim `deno task hooks` installed (any version).
 *
 * @param text - The hook file's text
 * @returns true when it carries {@linkcode SHIM_MARKER}
 */
export function isShim(text: string): boolean {
	return text.split("\n").some((line) => line.trim() === SHIM_MARKER);
}

/** What to do about one hook file in the shared hooks directory. */
export type HookPlan =
	| { kind: "write"; name: HookName; script: string }
	| { kind: "current"; name: HookName }
	| { kind: "refuse"; name: HookName; reason: string };

/**
 * Decides what to do about one hook: write the shim where there is no hook
 * or an older shim, leave a current shim alone, and refuse to replace a
 * hook someone else installed.
 *
 * @param options.name - The hook
 * @param options.existing - The file's text, or `undefined` when absent
 * @returns The plan
 */
export function hookPlan({
	name,
	existing,
}: {
	name: HookName;
	existing: string | undefined;
}): HookPlan {
	const script = shimScript(name);
	if (existing === script) return { kind: "current", name };
	if (existing === undefined || isShim(existing)) {
		return { kind: "write", name, script };
	}
	return {
		kind: "refuse",
		name,
		reason: `hooks/${name} is not a commit gate shim; move it aside (or chain it from ${BRANCH_HOOKS_DIR}/${name}) and rerun \`deno task hooks\``,
	};
}

/** What to do about `core.hooksPath`. */
export type HooksPathPlan =
	| { kind: "unset" }
	| { kind: "keep" }
	| { kind: "refuse"; reason: string };

/**
 * Decides what to do about `core.hooksPath`: it is unset where it is the
 * old gate setting (`.githooks`, relative or absolutized), since any value
 * hides the shims; any other value is the owner's, so it is refused.
 *
 * @param hooksPath - The configured `core.hooksPath`, if any
 * @returns The plan
 */
export function hooksPathPlan(hooksPath: string | undefined): HooksPathPlan {
	if (hooksPath === undefined) return { kind: "keep" };
	if (isGateHooksPath(hooksPath)) return { kind: "unset" };
	return {
		kind: "refuse",
		reason: `core.hooksPath is ${hooksPath}, which makes git ignore the shared hooks directory the commit gate installs into; unset it (or run ${BRANCH_HOOKS_DIR}/pre-commit from it) and rerun \`deno task hooks\``,
	};
}

function isGateHooksPath(path: string): boolean {
	const trimmed = path.replace(/\/+$/, "");
	return (
		trimmed === BRANCH_HOOKS_DIR ||
		trimmed === `./${BRANCH_HOOKS_DIR}` ||
		(trimmed.startsWith("/") && trimmed.endsWith(`/${BRANCH_HOOKS_DIR}`))
	);
}

/**
 * The warning `deno task ci` prints when commits in this clone are not
 * gated: a shim is missing or outdated, or `core.hooksPath` is set (which
 * makes git skip the shims).
 *
 * @param options.hooksPath - The configured `core.hooksPath`, if any
 * @param options.hooks - Each gate hook's text in the shared hooks directory, `undefined` when absent
 * @returns The one-line warning, or `undefined` when commits are gated
 */
export function hooksWarning({
	hooksPath,
	hooks,
}: {
	hooksPath: string | undefined;
	hooks: Readonly<Record<HookName, string | undefined>>;
}): string | undefined {
	if (hooksPath !== undefined) {
		return `warning: commits are not gated in this clone (core.hooksPath is ${hooksPath}, so git skips the commit gate's shims); run \`deno task hooks\``;
	}
	const missing = HOOK_NAMES.filter((name) => hooks[name] !== shimScript(name));
	return missing.length === 0
		? undefined
		: `warning: commits are not gated in this clone (no current shim for ${missing.join(", ")}); run \`deno task hooks\``;
}
