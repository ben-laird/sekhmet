// deno-coverage-ignore-file
/**
 * `deno task compat:smoke <runtime>`: installs every published `@sekhmet`
 * package from JSR the way a user of the runtime would, imports every export
 * path, runs one exercise per package, and prints a per-package,
 * per-export-path summary. Exits non-zero on any failure.
 *
 * The work happens in a temporary project outside the repository; `--keep`
 * keeps it for inspection.
 *
 * @module
 */

import {
	isErr,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { copy } from "@std/fs";
import { join } from "@std/path";
import { type Options, parseOptions, USAGE } from "@/src/args.ts";
import { ENTRY_FILE, renderEntry } from "@/src/entry.ts";
import {
	exportPaths,
	type PackageName,
	type PublishedPackage,
} from "@/src/package.ts";
import { type Command, planFor } from "@/src/plan.ts";
import { describeRegistryError, fetchPublished } from "@/src/registry.ts";
import { findReport, judge } from "@/src/report.ts";
import { targetOf } from "@/src/runtime.ts";
import { publishedNames } from "@/src/workspace.ts";

/** The exit codes {@linkcode main} returns. */
export const EXIT_CODES: {
	readonly PASSED: 0;
	readonly FAILED: 1;
	readonly USAGE: 2;
	readonly SETUP_FAILED: 3;
} = { PASSED: 0, FAILED: 1, USAGE: 2, SETUP_FAILED: 3 };

const REPO_ROOT = new URL("../../", import.meta.url);
const PROBE_DIR = new URL("./probe/", import.meta.url);
const RUNNERS_DIR = new URL("./runners/", import.meta.url);
const decoder = new TextDecoder();

async function readPublishedNames(): Promise<Result<PackageName[], string>> {
	const manifests = new Map<string, unknown>();
	const packagesDir = new URL("packages/", REPO_ROOT);
	for await (const entry of Deno.readDir(packagesDir)) {
		if (!entry.isDirectory) continue;
		const path = `packages/${entry.name}/deno.json`;
		manifests.set(
			path,
			JSON.parse(await Deno.readTextFile(new URL(path, REPO_ROOT))),
		);
	}
	return publishedNames(manifests);
}

async function execute({
	command,
	cwd,
	capture,
}: {
	command: Command;
	cwd: string;
	capture: boolean;
}): Promise<{ success: boolean; stdout: string }> {
	console.error(`$ ${[command.program, ...command.args].join(" ")}`);
	try {
		const output = await new Deno.Command(command.program, {
			args: [...command.args],
			cwd,
			stdin: "null",
			stdout: capture ? "piped" : "inherit",
			stderr: "inherit",
		}).output();
		return {
			success: output.success,
			stdout: capture ? decoder.decode(output.stdout) : "",
		};
	} catch (error: unknown) {
		console.error(`could not run ${command.program}: ${String(error)}`);
		return { success: false, stdout: "" };
	}
}

async function installedVersion({
	project,
	name,
}: {
	project: string;
	name: PackageName;
}): Promise<string | undefined> {
	try {
		const manifest: unknown = JSON.parse(
			await Deno.readTextFile(
				join(project, "node_modules", name, "package.json"),
			),
		);
		const version =
			typeof manifest === "object" && manifest !== null
				? Reflect.get(manifest, "version")
				: undefined;
		return typeof version === "string" ? version : undefined;
	} catch {
		return undefined;
	}
}

async function smoke({
	options,
	packages,
	project,
}: {
	options: Options;
	packages: readonly PublishedPackage[];
	project: string;
}): Promise<number> {
	const target = targetOf(options.runtime);
	const plan = planFor({ target, packages });

	await Deno.writeTextFile(
		join(project, "package.json"),
		`${JSON.stringify({ name: "sekhmet-compat-smoke", private: true, type: "module" }, null, "\t")}\n`,
	);
	if (plan.npmrc !== undefined) {
		await Deno.writeTextFile(join(project, ".npmrc"), plan.npmrc);
	}
	await copy(PROBE_DIR, join(project, "src"));
	await copy(RUNNERS_DIR, join(project, "runners"));
	await Deno.writeTextFile(
		join(project, "src", ENTRY_FILE),
		renderEntry({ target, paths: packages.flatMap(exportPaths) }),
	);

	for (const command of [...plan.install, plan.build]) {
		const { success } = await execute({
			command,
			cwd: project,
			capture: false,
		});
		if (!success) {
			console.error(
				`setup failed at: ${command.program} ${command.args.join(" ")}`,
			);
			return EXIT_CODES.SETUP_FAILED;
		}
	}

	const installed = new Map<PackageName, string>();
	for (const { name } of packages) {
		const version = await installedVersion({ project, name });
		if (version !== undefined) installed.set(name, version);
	}

	const run = await execute({ command: plan.run, cwd: project, capture: true });
	const report = findReport(run.stdout);
	if (isErr(report)) {
		console.error(run.stdout);
		console.error(`${options.runtime}: ${unwrapErr(report)}`);
		return EXIT_CODES.FAILED;
	}

	const verdict = judge({ packages, installed, report: unwrap(report) });
	console.log(`\ncompat smoke: ${options.runtime}`);
	for (const line of verdict.lines) console.log(line);
	if (!run.success) {
		console.log(`FAIL: the probe exited non-zero on ${options.runtime}`);
		return EXIT_CODES.FAILED;
	}
	return verdict.failures === 0 ? EXIT_CODES.PASSED : EXIT_CODES.FAILED;
}

/**
 * Runs one smoke test.
 *
 * @param args - The command-line arguments (see `USAGE` in `src/args.ts`)
 * @returns The exit code, one of {@linkcode EXIT_CODES}
 */
export async function main(args: readonly string[]): Promise<number> {
	const parsed = parseOptions(args);
	if (isErr(parsed)) {
		console.error(`${unwrapErr(parsed)}\n\n${USAGE}`);
		return EXIT_CODES.USAGE;
	}
	const options = unwrap(parsed);

	const published = await readPublishedNames();
	if (isErr(published)) {
		console.error(unwrapErr(published));
		return EXIT_CODES.SETUP_FAILED;
	}
	const names = unwrap(published);
	const unknown = [...options.requests.byPackage.keys()].filter(
		(name) => !names.includes(name),
	);
	if (unknown.length > 0) {
		console.error(
			`--version names unpublished packages: ${unknown.join(", ")}`,
		);
		return EXIT_CODES.USAGE;
	}

	const lookups = await Promise.all(
		names.map((name) =>
			fetchPublished({ name, requests: options.requests, fetch }),
		),
	);
	const packages: PublishedPackage[] = [];
	for (const lookup of lookups) {
		if (isErr(lookup)) {
			console.error(describeRegistryError(unwrapErr(lookup)));
			return EXIT_CODES.SETUP_FAILED;
		}
		packages.push(unwrap(lookup));
	}

	const project = await Deno.makeTempDir({ prefix: "sekhmet-compat-smoke-" });
	try {
		return await smoke({ options, packages, project });
	} finally {
		if (options.keep) console.error(`kept the project at ${project}`);
		else await Deno.remove(project, { recursive: true });
	}
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
