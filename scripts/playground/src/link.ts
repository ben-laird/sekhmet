/**
 * The decisions behind `deno task play:link`: which tree a target names, the
 * `playground/deno.json` that links the playground to that tree's packages,
 * how it merges with keys the owner added, and whether an existing link
 * still points at something.
 *
 * A linked `playground/deno.json` is not a workspace member, so Deno treats
 * `playground/` as a standalone project and honours its `links`: every
 * `@sekhmet/*` import resolves to the linked tree's source.
 *
 * Everything here is pure; git and the file system stay in `link.ts`.
 *
 * @module
 */

import { dirname, relative, resolve } from "@std/path";
import { z } from "zod";

/** A value or the reason there is none. */
export type Result<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: string };

/** A parsed `deno.json`: a JSON object. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** The tree whose packages the playground links to. */
export type Target =
	| { readonly kind: "checkout" }
	| { readonly kind: "branch"; readonly branch: string }
	| { readonly kind: "path"; readonly path: string };

/** What `play:link` was asked to do. */
export type Command =
	| { readonly kind: "status" }
	| { readonly kind: "off" }
	| { readonly kind: "link"; readonly target: Target };

/** One entry of `git worktree list --porcelain`. */
export interface Worktree {
	/** The absolute path of the worktree. */
	readonly path: string;
	/** The checked-out branch without `refs/heads/`; absent when detached or bare. */
	readonly branch?: string;
}

/** A workspace package found in the target tree's `packages/`. */
export interface LinkedPackage {
	/** The package name, e.g. `@sekhmet/enum`. */
	readonly name: string;
	/** Its version, when the `deno.json` has one. */
	readonly version?: string;
	/** Its directory name under `packages/`. */
	readonly directory: string;
}

/** The keys of `playground/deno.json` that `play:link` owns. */
export interface PlaygroundLink {
	/** One `jsr:` import per package, which `links` overrides. */
	readonly imports: Readonly<Record<string, string>>;
	/** Every package directory, relative to `playground/`. */
	readonly links: readonly string[];
	/** The target's root `compilerOptions`, when it has some. */
	readonly compilerOptions?: unknown;
}

/** What `playground/deno.json` currently links to. */
export type LinkState =
	| { readonly kind: "unlinked" }
	| {
			readonly kind: "linked";
			/** The tree the links point into (the parent of their `packages/`). */
			readonly root: string;
			/** Every link, resolved to an absolute path. */
			readonly links: readonly string[];
	  };

const SCOPE = "@sekhmet/";
const CHECKOUT_ALIASES: ReadonlySet<string> = new Set(["main", "checkout"]);
const OFF_ALIASES: ReadonlySet<string> = new Set(["off", "unlink"]);

const JsonObjectSchema = z.record(z.string(), z.unknown());

const PackageSchema = z.object({
	name: z.string().startsWith(SCOPE, { error: `no \`${SCOPE}*\` name` }),
	version: z.string().optional().catch(undefined),
});

const ImportsSchema = JsonObjectSchema.optional();

const LinksSchema = z
	.array(z.unknown())
	.transform((links) =>
		links.filter((link): link is string => typeof link === "string"),
	)
	.catch([]);

function describeIssues(error: z.ZodError): string {
	return error.issues
		.map(({ path, message }) =>
			path.length === 0 ? message : `\`${path.join(".")}\`: ${message}`,
		)
		.join("; ");
}

/**
 * Parses `play:link`'s arguments. `main`/`checkout` name this clone's own
 * checkout, `off`/`unlink` remove the link, an argument starting with `/`,
 * `.` or `~` is a path, and anything else is a branch name.
 *
 * @param args - The command-line arguments
 * @returns The command, or why the arguments are not one
 */
export function parseCommand(args: readonly string[]): Result<Command> {
	if (args.length > 1) {
		return {
			ok: false,
			error: `expected at most one target, got ${args.length}: ${args.join(" ")}`,
		};
	}
	const [arg] = args;
	if (arg === undefined || arg === "") {
		return { ok: true, value: { kind: "status" } };
	}
	if (OFF_ALIASES.has(arg)) return { ok: true, value: { kind: "off" } };
	if (CHECKOUT_ALIASES.has(arg)) {
		return { ok: true, value: { kind: "link", target: { kind: "checkout" } } };
	}
	if (/^[/.~]/.test(arg)) {
		return {
			ok: true,
			value: { kind: "link", target: { kind: "path", path: arg } },
		};
	}
	return {
		ok: true,
		value: { kind: "link", target: { kind: "branch", branch: arg } },
	};
}

/**
 * Parses the output of `git worktree list --porcelain`.
 *
 * @param porcelain - The command's output
 * @returns One entry per worktree, in git's order
 */
export function parseWorktrees(porcelain: string): Worktree[] {
	return porcelain.split(/\n\s*\n/).flatMap((block): Worktree[] => {
		const lines = block.split("\n");
		const path = fieldOf({ lines, key: "worktree" });
		if (path === undefined) return [];
		const ref = fieldOf({ lines, key: "branch" });
		return ref === undefined
			? [{ path }]
			: [{ path, branch: ref.replace(/^refs\/heads\//, "") }];
	});
}

function fieldOf({
	lines,
	key,
}: {
	lines: readonly string[];
	key: string;
}): string | undefined {
	const line = lines.find((candidate) => candidate.startsWith(`${key} `));
	return line?.slice(key.length + 1);
}

/**
 * Finds the worktree that has a branch checked out.
 *
 * @param options - The worktrees and the branch to look for
 * @returns The worktree, or an error listing the branches that have one
 */
export function findWorktree({
	worktrees,
	branch,
}: {
	worktrees: readonly Worktree[];
	branch: string;
}): Result<Worktree> {
	const found = worktrees.find((worktree) => worktree.branch === branch);
	if (found !== undefined) return { ok: true, value: found };

	const branches = worktrees.flatMap(({ branch }) =>
		branch === undefined ? [] : [branch],
	);
	return {
		ok: false,
		error: [
			`no worktree has branch \`${branch}\` checked out.`,
			branches.length === 0
				? "No worktree has a branch checked out."
				: `Branches with a worktree: ${branches.join(", ")}`,
			"Pass a path (starting with `/`, `.` or `~`) to link any other checkout.",
		].join("\n"),
	};
}

/**
 * Decodes a target package's parsed `deno.json`.
 *
 * @param options - The parsed `deno.json` and its directory under `packages/`
 * @returns The package, or why it is not a `@sekhmet/*` package
 */
export function decodePackage({
	json,
	directory,
}: {
	json: unknown;
	directory: string;
}): Result<LinkedPackage> {
	const parsed = PackageSchema.safeParse(json);
	if (!parsed.success) {
		return { ok: false, error: describeIssues(parsed.error) };
	}
	const { name, version } = parsed.data;
	return version !== undefined
		? { ok: true, value: { name, version, directory } }
		: { ok: true, value: { name, directory } };
}

/**
 * Builds the keys that link the playground to a tree's packages.
 *
 * @param options - The packages, the tree root, the playground directory
 *   (both absolute) and the tree's root `compilerOptions`
 * @returns The `@sekhmet/*` imports, the links and the compiler options
 */
export function buildLink({
	packages,
	root,
	playground,
	compilerOptions,
}: {
	packages: readonly LinkedPackage[];
	root: string;
	playground: string;
	compilerOptions: unknown;
}): PlaygroundLink {
	const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
	const imports = Object.fromEntries(
		sorted.map(({ name, version }) => [
			name,
			version === undefined ? `jsr:${name}` : `jsr:${name}@^${version}`,
		]),
	);
	const links = sorted.map(({ directory }) =>
		relative(playground, resolve(root, "packages", directory)),
	);
	return compilerOptions === undefined
		? { imports, links }
		: { imports, links, compilerOptions };
}

/**
 * Writes a link into an existing `playground/deno.json`, replacing the keys
 * `play:link` owns and keeping every other key and non-`@sekhmet/*` import.
 *
 * @param options - The existing config (`{}` when there is none) and the link
 * @returns The merged config, or why the existing one cannot be merged
 */
export function applyLink({
	config,
	link,
}: {
	config: JsonObject;
	link: PlaygroundLink;
}): Result<JsonObject> {
	const kept = ownImports(config);
	if (!kept.ok) return kept;

	const { compilerOptions: _, ...rest } = config;
	const merged: Record<string, unknown> = {
		...rest,
		imports: { ...kept.value, ...link.imports },
		links: link.links,
	};
	if (link.compilerOptions !== undefined) {
		merged.compilerOptions = link.compilerOptions;
	}
	return { ok: true, value: merged };
}

/**
 * Removes what `play:link` owns from `playground/deno.json`.
 *
 * @param config - The existing config
 * @returns The remaining config, `undefined` when nothing is left (delete the
 *   file), or why the existing one cannot be edited
 */
export function removeLink(config: JsonObject): Result<JsonObject | undefined> {
	const kept = ownImports(config);
	if (!kept.ok) return kept;

	const { imports: _, links: __, compilerOptions: ___, ...rest } = config;
	const remaining: Record<string, unknown> =
		Object.keys(kept.value).length === 0
			? rest
			: { ...rest, imports: kept.value };
	return {
		ok: true,
		value: Object.keys(remaining).length === 0 ? undefined : remaining,
	};
}

function ownImports(config: JsonObject): Result<Record<string, unknown>> {
	const imports = ImportsSchema.safeParse(config.imports);
	if (!imports.success) {
		return { ok: false, error: "`imports` is not an object" };
	}
	return {
		ok: true,
		value: Object.fromEntries(
			Object.entries(imports.data ?? {}).filter(
				([name]) => !name.startsWith(SCOPE),
			),
		),
	};
}

/**
 * Reads which tree a `playground/deno.json` links to. The tree is the parent
 * of the first link's `packages/` directory.
 *
 * @param options - The config (`undefined` when there is no file) and the
 *   absolute playground directory its links are relative to
 * @returns Whether it links somewhere, and where
 */
export function readLinkState({
	config,
	playground,
}: {
	config: JsonObject | undefined;
	playground: string;
}): LinkState {
	const resolved = LinksSchema.parse(config?.links).map((link) =>
		resolve(playground, link),
	);
	const [first] = resolved;
	if (first === undefined) return { kind: "unlinked" };
	return { kind: "linked", root: dirname(dirname(first)), links: resolved };
}

/**
 * Lists the links whose directory no longer exists, e.g. because their
 * worktree was removed after its branch merged.
 *
 * @param options - The absolute links and a predicate for "this directory exists"
 * @returns The dangling links, in order
 */
export function danglingLinks({
	links,
	exists,
}: {
	links: readonly string[];
	exists: (path: string) => boolean;
}): string[] {
	return links.filter((link) => !exists(link));
}

/**
 * Renders the status `play:link` prints when run without a target.
 *
 * @param options - The link state, its dangling links, and a description of
 *   the linked tree's branch and commit when it still exists
 * @returns The lines to print
 */
export function describeStatus({
	state,
	dangling,
	revision,
}: {
	state: LinkState;
	dangling: readonly string[];
	revision: string | undefined;
}): string {
	if (state.kind === "unlinked") {
		return [
			"playground/ is not linked: it follows the root workspace (this checkout).",
			"Link it with `deno task play:link <main|branch|path>`.",
		].join("\n");
	}
	const header = `playground/ is linked to ${state.root}${revision === undefined ? "" : ` (${revision})`}`;
	if (dangling.length === 0) return header;
	return [
		header,
		`${dangling.length} of ${state.links.length} link paths no longer exist:`,
		...dangling.map((link) => `  ${link}`),
		"The worktree was probably removed. Relink with `deno task play:link main`",
		"(or another branch or path), or drop the link with `deno task play:link off`.",
	].join("\n");
}

/**
 * Serializes a config the way the repo formats JSON: tabs and a final newline.
 *
 * @param config - The config to write
 * @returns The file contents
 */
export function formatConfig(config: JsonObject): string {
	return `${JSON.stringify(config, null, "\t")}\n`;
}

/**
 * Parses the text of an existing `playground/deno.json`.
 *
 * @param text - The file contents
 * @returns The config, or why it is not a JSON object
 */
export function parseConfig(text: string): Result<JsonObject> {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error: unknown) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, error: `not valid JSON (${reason})` };
	}
	const parsed = JsonObjectSchema.safeParse(json);
	return parsed.success
		? { ok: true, value: parsed.data }
		: { ok: false, error: "not a JSON object" };
}
