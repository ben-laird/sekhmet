// deno-coverage-ignore-file
/**
 * `deno task play:link [target]`: points the main checkout's gitignored
 * `playground/` at the packages of a checkout or worktree, so the editor and
 * `deno run` inside `playground/` use that tree's source.
 *
 * - `main` / `checkout`: this clone's main checkout
 * - a branch name: the worktree that has it checked out
 * - a path (starting with `/`, `.` or `~`): any checkout or worktree
 * - `off` / `unlink`: remove the link (and the file, if nothing else is left)
 * - no argument: print the current link and flag dangling paths
 *
 * Git and the file system live here; every decision is in `src/link.ts`.
 *
 * @module
 */

import { dirname, join, resolve } from "@std/path";
import {
	applyLink,
	buildLink,
	type Command,
	danglingLinks,
	decodePackage,
	describeStatus,
	findWorktree,
	formatConfig,
	type JsonObject,
	type LinkedPackage,
	parseCommand,
	parseConfig,
	parseWorktrees,
	type Result,
	readLinkState,
	removeLink,
	type Target,
} from "@/src/link.ts";

const RESTART =
	"Restart the Deno language server (VS Code: `Deno: Restart Language Server`) to pick it up.";

/** Paths `play:link` works with. */
interface Places {
	/** The main checkout: the parent of the git common dir. */
	readonly checkout: string;
	/** The main checkout's `playground/`. */
	readonly playground: string;
	/** `playground/deno.json`. */
	readonly config: string;
}

async function git({
	args,
	cwd,
}: {
	args: readonly string[];
	cwd: string;
}): Promise<Result<string>> {
	const output = await new Deno.Command("git", {
		args: [...args],
		cwd,
		stdout: "piped",
		stderr: "piped",
	}).output();
	const decoder = new TextDecoder();
	return output.success
		? { ok: true, value: decoder.decode(output.stdout).trim() }
		: {
				ok: false,
				error: `git ${args.join(" ")}: ${decoder.decode(output.stderr).trim()}`,
			};
}

async function readText(path: string): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(path);
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

function isDirectory(path: string): boolean {
	try {
		return Deno.statSync(path).isDirectory;
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return false;
		throw error;
	}
}

async function places(cwd: string): Promise<Result<Places>> {
	const common = await git({
		args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
		cwd,
	});
	if (!common.ok) return common;
	const checkout = dirname(common.value);
	const playground = join(checkout, "playground");
	return {
		ok: true,
		value: { checkout, playground, config: join(playground, "deno.json") },
	};
}

async function readConfig(
	path: string,
): Promise<Result<JsonObject | undefined>> {
	const text = await readText(path);
	if (text === undefined) return { ok: true, value: undefined };
	const parsed = parseConfig(text);
	return parsed.ok ? parsed : { ok: false, error: `${path}: ${parsed.error}` };
}

async function revision(root: string): Promise<string | undefined> {
	const branch = await git({
		args: ["rev-parse", "--abbrev-ref", "HEAD"],
		cwd: root,
	});
	const commit = await git({
		args: ["log", "-1", "--format=%h %s"],
		cwd: root,
	});
	if (!branch.ok || !commit.ok) return undefined;
	return `branch ${branch.value}, commit ${commit.value}`;
}

function expandHome(path: string): string {
	const home = Deno.env.get("HOME");
	return home !== undefined && (path === "~" || path.startsWith("~/"))
		? join(home, path.slice(1))
		: path;
}

async function resolveRoot({
	target,
	at,
	cwd,
}: {
	target: Target;
	at: Places;
	cwd: string;
}): Promise<Result<string>> {
	switch (target.kind) {
		case "checkout":
			return { ok: true, value: at.checkout };
		case "path":
			return { ok: true, value: resolve(cwd, expandHome(target.path)) };
		case "branch": {
			const porcelain = await git({
				args: ["worktree", "list", "--porcelain"],
				cwd: at.checkout,
			});
			if (!porcelain.ok) return porcelain;
			const found = findWorktree({
				worktrees: parseWorktrees(porcelain.value),
				branch: target.branch,
			});
			return found.ok ? { ok: true, value: found.value.path } : found;
		}
	}
}

async function readPackages(root: string): Promise<Result<LinkedPackage[]>> {
	const packages = join(root, "packages");
	if (!isDirectory(packages)) {
		return { ok: false, error: `${root} has no packages/ directory` };
	}
	const directories: string[] = [];
	for await (const entry of Deno.readDir(packages)) {
		if (entry.isDirectory) directories.push(entry.name);
	}
	const found: LinkedPackage[] = [];
	for (const directory of directories.sort()) {
		const text = await readText(join(packages, directory, "deno.json"));
		if (text === undefined) continue;
		const parsed = parseConfig(text);
		const decoded = parsed.ok
			? decodePackage({ json: parsed.value, directory })
			: parsed;
		if (!decoded.ok) {
			return {
				ok: false,
				error: `packages/${directory}/deno.json: ${decoded.error}`,
			};
		}
		found.push(decoded.value);
	}
	return found.length === 0
		? { ok: false, error: `${packages} has no @sekhmet/* packages` }
		: { ok: true, value: found };
}

async function link({
	target,
	at,
	cwd,
}: {
	target: Target;
	at: Places;
	cwd: string;
}): Promise<Result<string>> {
	const root = await resolveRoot({ target, at, cwd });
	if (!root.ok) return root;
	const packages = await readPackages(root.value);
	if (!packages.ok) return packages;
	const rootConfig = await readConfig(join(root.value, "deno.json"));
	if (!rootConfig.ok) return rootConfig;
	const existing = await readConfig(at.config);
	if (!existing.ok) return existing;

	const merged = applyLink({
		config: existing.value ?? {},
		link: buildLink({
			packages: packages.value,
			root: root.value,
			playground: at.playground,
			compilerOptions: rootConfig.value?.compilerOptions,
			imports: rootConfig.value?.imports,
		}),
	});
	if (!merged.ok) return { ok: false, error: `${at.config}: ${merged.error}` };

	await Deno.mkdir(at.playground, { recursive: true });
	await Deno.writeTextFile(at.config, formatConfig(merged.value));
	return {
		ok: true,
		value: [
			`Linked playground/ to ${root.value}`,
			`  ${(await revision(root.value)) ?? "not a git checkout"}`,
			`  ${packages.value.map(({ name }) => name).join(", ")}`,
			RESTART,
		].join("\n"),
	};
}

async function unlink(at: Places): Promise<Result<string>> {
	const existing = await readConfig(at.config);
	if (!existing.ok) return existing;
	if (existing.value === undefined) {
		return { ok: true, value: "playground/ is not linked; nothing to do." };
	}
	const remaining = removeLink(existing.value);
	if (!remaining.ok) {
		return { ok: false, error: `${at.config}: ${remaining.error}` };
	}
	if (remaining.value === undefined) {
		await Deno.remove(at.config);
		return {
			ok: true,
			value: `Removed ${at.config}; playground/ follows the root workspace again.\n${RESTART}`,
		};
	}
	await Deno.writeTextFile(at.config, formatConfig(remaining.value));
	return {
		ok: true,
		value: `Removed the link from ${at.config}, keeping your other keys. It still makes playground/ a standalone project.\n${RESTART}`,
	};
}

async function status(at: Places): Promise<Result<string>> {
	const existing = await readConfig(at.config);
	if (!existing.ok) return existing;
	const state = readLinkState({
		config: existing.value,
		playground: at.playground,
	});
	if (state.kind === "unlinked") {
		return {
			ok: true,
			value: describeStatus({ state, dangling: [], revision: undefined }),
		};
	}
	const dangling = danglingLinks({ links: state.links, exists: isDirectory });
	return {
		ok: true,
		value: describeStatus({
			state,
			dangling,
			revision: isDirectory(state.root)
				? await revision(state.root)
				: undefined,
		}),
	};
}

async function run({
	command,
	cwd,
}: {
	command: Command;
	cwd: string;
}): Promise<Result<string>> {
	const at = await places(cwd);
	if (!at.ok) return at;
	switch (command.kind) {
		case "status":
			return status(at.value);
		case "off":
			return unlink(at.value);
		case "link":
			return link({ target: command.target, at: at.value, cwd });
	}
}

if (import.meta.main) {
	// `deno task` runs from the config's directory; INIT_CWD is where it was invoked.
	const cwd = Deno.env.get("INIT_CWD") ?? Deno.cwd();
	const command = parseCommand(Deno.args);
	const outcome = command.ok
		? await run({ command: command.value, cwd })
		: command;
	if (outcome.ok) {
		console.log(outcome.value);
	} else {
		console.error(`play:link: ${outcome.error}`);
		Deno.exit(1);
	}
}
