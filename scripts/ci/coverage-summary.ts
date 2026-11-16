// deno-coverage-ignore-file
import { parseArgs } from "@std/cli";
import { join, resolve } from "@std/path";
import {
	coverageTotals,
	percent,
	summarizeCoverage,
} from "@/src/coverage/coverage.ts";
import { describeLcovError, parseLcov } from "@/src/coverage/lcov.ts";
import { renderCoverageMarkdown } from "@/src/coverage/markdown.ts";
import { readWorkspace } from "@/src/readiness/readiness.ts";
import { readWorkspaceFiles } from "@/src/workspace-files.ts";

/** The coverage directory `deno test --coverage` writes by default. */
export const DEFAULT_COVERAGE_DIR = "coverage";

/**
 * The coverage summary runner, the I/O edge around `src/coverage/`. It reads
 * the LCOV report (`lcov.info`) that `deno test --coverage=<dir>` wrote and
 * summarizes it per workspace package.
 *
 * Usage: `coverage-summary.ts <github|json> [--root <dir>] [--coverage-dir <dir>]`
 *
 * `--coverage-dir` defaults to {@linkcode DEFAULT_COVERAGE_DIR}; a relative
 * one resolves against the root.
 *
 * - `github`: appends a markdown table to the job summary
 *   (`$GITHUB_STEP_SUMMARY`) and prints the totals line
 * - `json`: prints the totals, overall and per package, as JSON (for the AI
 *   output)
 */
export async function main(args: string[]): Promise<number> {
	const {
		_: [format],
		root: rootArg = Deno.cwd(),
		"coverage-dir": coverageDir = DEFAULT_COVERAGE_DIR,
	} = parseArgs(args, {
		string: ["root", "coverage-dir"],
	});
	if (format !== "github" && format !== "json") {
		console.error(
			"Usage: coverage-summary.ts <github|json> [--root <dir>] [--coverage-dir <dir>]",
		);
		return 2;
	}
	const root = resolve(rootArg);
	const lcovPath = join(coverageDir, "lcov.info");

	const lcov = await readText(resolve(root, lcovPath));
	if (lcov === undefined) {
		console.error(
			`${lcovPath} not found: Deno Test writes it when run with --coverage`,
		);
		return 1;
	}
	const parsed = parseLcov({ text: lcov, repoRoot: root });
	if (!parsed.ok) {
		console.error(`${lcovPath}: ${describeLcovError(parsed.error)}`);
		return 1;
	}

	const workspace = readWorkspace(await readWorkspaceFiles(root));
	const packages = workspace.ok
		? workspace.value.members.map(({ dir, manifest }) => ({
				name: manifest.name ?? dir,
				dir,
			}))
		: [];
	const summary = summarizeCoverage({ files: parsed.value, packages });

	if (format === "json") {
		console.log(JSON.stringify(coverageTotals(summary)));
		return 0;
	}

	const stepSummary = Deno.env.get("GITHUB_STEP_SUMMARY");
	if (stepSummary) {
		await Deno.writeTextFile(stepSummary, renderCoverageMarkdown(summary), {
			append: true,
		});
	}
	const share = (value: number | undefined) =>
		value === undefined ? "n/a" : `${value.toFixed(1)}%`;
	console.log(
		`Coverage: lines ${share(percent(summary.lines))}, branches ${share(percent(summary.branches))}, functions ${share(percent(summary.functions))}`,
	);
	return 0;
}

async function readText(path: string): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(path);
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
