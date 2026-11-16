// deno-coverage-ignore-file
import { parseArgs } from "@std/cli";
import { join } from "@std/path";
import { biomeCiCommand } from "@/main.ts";
import type { StepCommand } from "@/mod.ts";
import {
	GATE_TOOLS,
	type GateTool,
	gateFiles,
	isGateTool,
} from "@/src/gate-files.ts";

/**
 * Runs a gate tool over the paths git does not ignore, the I/O edge around
 * {@linkcode gateFiles}: asks git for the files, then runs `biome ci`,
 * `deno check`, `deno lint` or `deno test` over exactly the paths
 * `gateFiles` derives from them, so gitignored scratch (`playground/`) can
 * never fail the gate. The tool runs in the working directory, so it reads
 * that directory's `deno.json` and `biome.json`.
 *
 * Usage: `gate-files.ts <biome|check|lint|test> [--root <dir>] [-- <tool args>]`
 *
 * `--root` lists another checkout (default: the working directory, the repo
 * root under `deno task ci`), handing the tool its paths joined to the root.
 * Arguments after `--` go to the tool, before the paths.
 *
 * @param args - The command-line arguments
 * @returns The exit code: the tool's, or 1 when there is nothing to run
 */
export async function main(args: string[]): Promise<number> {
	const {
		_: [tool],
		root,
		"--": toolArgs,
	} = parseArgs(args, { string: ["root"], "--": true });
	if (!isGateTool(tool)) {
		console.error(
			`usage: gate-files.ts <${GATE_TOOLS.join("|")}> [--root <dir>] [-- <tool args>], got ${args.join(" ")}`,
		);
		return 1;
	}
	const listed = await gitLsFiles({
		root,
		flags: ["--cached", "--others", "--exclude-standard"],
	});
	if (!listed.ok) {
		console.error(listed.error);
		return 1;
	}
	const deleted = await gitLsFiles({ root, flags: ["--deleted"] });
	if (!deleted.ok) {
		console.error(deleted.error);
		return 1;
	}
	const files = gateFiles({
		tool,
		listed: listed.value,
		deleted: deleted.value,
	});
	if (!files.ok) {
		console.error(files.error);
		return 1;
	}
	const { program, args: commandArgs = [] } = toolCommand({
		tool,
		args: toolArgs,
		paths: files.paths.map((path) =>
			root === undefined ? path : join(root, path),
		),
	});
	// Inherit stdio: the tool's diagnostics are the step's output
	const { code } = await new Deno.Command(program, {
		args: [...commandArgs],
		stdin: "null",
		stdout: "inherit",
		stderr: "inherit",
	}).spawn().status;
	return code;
}

function toolCommand({
	tool,
	args,
	paths,
}: {
	tool: GateTool;
	args: string[];
	paths: string[];
}): StepCommand {
	return tool === "biome"
		? biomeCiCommand({ paths: [...args, ...paths] })
		: { program: "deno", args: [tool, ...args, ...paths] };
}

async function gitLsFiles({
	root,
	flags,
}: {
	root: string | undefined;
	flags: string[];
}): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
	const output = await new Deno.Command("git", {
		args: [
			...(root === undefined ? [] : ["-C", root]),
			"ls-files",
			"-z",
			...flags,
		],
		stdin: "null",
	}).output();
	const decoder = new TextDecoder();
	return output.success
		? { ok: true, value: decoder.decode(output.stdout) }
		: {
				ok: false,
				error: `git ls-files failed: ${decoder.decode(output.stderr)}`,
			};
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
