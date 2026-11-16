/**
 * Release driver for `.github/workflows/release.yml`: run on every push to
 * main, it versions pending Records, pushes the bump, tags and publishes with
 * `dv release`, and opens one GitHub Release per newly released tag.
 *
 * Usage: `deno run -A scripts/release/main.ts [--force]`. Needs `dv` and `gh`
 * on PATH, a git identity, and `GH_TOKEN` for `gh`.
 *
 * @module
 */

import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import {
	type GitHubRelease,
	gitHubReleases,
	parseReleaseResult,
	parseStatusPlan,
	releasedPackages,
	releaseSteps,
} from "./src/plan.ts";

// dv's default `changelog.location`, which .dv/config.yaml keeps.
async function readChangelogs(
	paths: readonly string[],
): Promise<Map<string, string>> {
	const changelogs = new Map<string, string>();
	for (const path of paths) {
		try {
			changelogs.set(path, await Deno.readTextFile(`${path}/CHANGELOG.md`));
		} catch (caught: unknown) {
			if (!(caught instanceof Deno.errors.NotFound)) throw caught;
		}
	}
	return changelogs;
}

interface Finished {
	code: number;
	stdout: string;
}

async function run({
	command,
	args,
	stdin,
	capture = false,
}: {
	command: string;
	args: string[];
	stdin?: string;
	capture?: boolean;
}): Promise<Result<Finished, string>> {
	console.error(`$ ${command} ${args.join(" ")}`);
	try {
		const child = new Deno.Command(command, {
			args,
			stdin: stdin === undefined ? "null" : "piped",
			stdout: capture ? "piped" : "inherit",
			stderr: "inherit",
		}).spawn();
		if (stdin !== undefined) {
			const writer = child.stdin.getWriter();
			await writer.write(new TextEncoder().encode(stdin));
			await writer.close();
		}
		const output = await child.output();
		return Ok({
			code: output.code,
			stdout: capture ? new TextDecoder().decode(output.stdout) : "",
		});
	} catch (caught: unknown) {
		return Err(
			`cannot run ${command}: ${caught instanceof Error ? caught.message : String(caught)}`,
		);
	}
}

async function succeed(
	args: Parameters<typeof run>[0],
): Promise<Result<string, string>> {
	const finished = await run(args);
	if (isErr(finished)) return Err(unwrapErr(finished));
	const { code, stdout } = unwrap(finished);
	return code === 0
		? Ok(stdout)
		: Err(`${args.command} ${args.args.join(" ")} exited with ${code}`);
}

async function createGitHubRelease({
	tag,
	notes,
}: GitHubRelease): Promise<Result<void, string>> {
	const existing = await run({
		command: "gh",
		args: ["release", "view", tag],
		capture: true,
	});
	if (!isErr(existing) && unwrap(existing).code === 0) {
		console.error(`GitHub Release ${tag} already exists; skipping.`);
		return Ok(undefined);
	}
	const created = await succeed({
		command: "gh",
		args: ["release", "create", tag, "--title", tag, "--notes-file", "-"],
		stdin: notes,
	});
	return isErr(created) ? Err(unwrapErr(created)) : Ok(undefined);
}

async function release(force: boolean): Promise<Result<void, string>> {
	// Capture the plan before `dv version` consumes the Records.
	const statusText = await succeed({
		command: "dv",
		args: ["status", "--json"],
		capture: true,
	});
	if (isErr(statusText)) return Err(unwrapErr(statusText));
	const status = parseStatusPlan(unwrap(statusText));
	if (isErr(status)) {
		return Err(`unexpected dv status output: ${unwrapErr(status)}`);
	}
	const steps = releaseSteps({ status: unwrap(status), force });
	if (!steps.release) {
		console.error("Nothing pending or untagged; no release.");
		return Ok(undefined);
	}

	if (steps.version) {
		const versioned = await succeed({
			command: "dv",
			args: ["version", "--yes"],
		});
		if (isErr(versioned)) return Err(unwrapErr(versioned));
		const pushed = await succeed({
			command: "git",
			args: ["push", "origin", "HEAD:main"],
		});
		if (isErr(pushed)) return Err(unwrapErr(pushed));
	}

	const releaseArgs = ["release", "--yes", "--push", "--json"];
	if (force) releaseArgs.push("--force");
	const released = await run({
		command: "dv",
		args: releaseArgs,
		capture: true,
	});
	if (isErr(released)) return Err(unwrapErr(released));
	const { code, stdout } = unwrap(released);

	// dv prints the result even on a partial failure, so successful packages
	// still get their Release before the job fails.
	const result = parseReleaseResult(stdout);
	if (isErr(result)) {
		return Err(`dv release exited ${code}; output: ${unwrapErr(result)}`);
	}
	const changelogs = await readChangelogs(
		releasedPackages(unwrap(result)).map(({ path }) => path),
	);
	// Attempt every Release, so one gh failure cannot hide the others.
	const failures: string[] = [];
	for (const githubRelease of gitHubReleases({
		result: unwrap(result),
		changelogs,
	})) {
		const created = await createGitHubRelease(githubRelease);
		if (isErr(created)) {
			failures.push(`${githubRelease.tag}: ${unwrapErr(created)}`);
		}
	}
	if (code !== 0) {
		failures.push(
			`dv release exited ${code}; rerun the workflow with force to retry`,
		);
	}
	return failures.length === 0
		? Ok(undefined)
		: Err(`\n  - ${failures.join("\n  - ")}`);
}

if (import.meta.main) {
	const outcome = await release(Deno.args.includes("--force"));
	if (isErr(outcome)) {
		console.error(`release failed: ${unwrapErr(outcome)}`);
		Deno.exit(1);
	}
}
