// deno-coverage-ignore-file
import { fromFileUrl } from "@std/path";
import {
	runWorkflow,
	type StepCommand,
	type StepOutputs,
	type WorkflowStep,
} from "@/mod.ts";

/**
 * Exit codes for CI workflow failures.
 * Each step has a unique exit code to identify which step failed.
 */
export const EXIT_CODES = {
	/** Exit code when Deno lint fails */
	DENO_LINT_FAILED: 1,
	/** Exit code when Biome check fails */
	BIOME_CHECK_FAILED: 2,
	/** Exit code when documentation lint fails */
	DOC_LINT_FAILED: 3,
	/** Exit code when JSR publish dry run fails */
	JSR_DRY_RUN_FAILED: 4,
	/** Exit code when tests fail */
	TESTS_FAILED: 5,
	/** Exit code when coverage report generation fails */
	COVERAGE_FAILED: 6,
	/** Exit code when Deno type checking fails */
	DENO_CHECK_FAILED: 7,
	/** Exit code when removing local coverage data fails */
	CLEANUP_FAILED: 8,
	/** Exit code when the publish-readiness checks fail */
	PUBLISH_READINESS_FAILED: 9,
	/** Exit code when the coverage summary cannot be built */
	COVERAGE_SUMMARY_FAILED: 10,
	/** Exit code when generated main modules are stale versus their mini source */
	GENERATED_MAIN_STALE: 11,
	/** Exit code when `dv validate` rejects the dv config or a Record */
	DV_VALIDATE_FAILED: 12,
} as const;

/**
 * The environment the CI workflow adapts to.
 */
export interface CIEnvironment {
	/** Running in a CI service (`CI=true`) */
	isCI: boolean;
	/** Running for an AI agent (`CI_AI=true`) */
	isAI: boolean;
}

/**
 * The Biome CI check, over the whole project or the given paths.
 *
 * The npm launcher needs `--allow-env` (reads `BIOME_BINARY`) and
 * `--allow-run` (spawns the native binary). Without `--allow-run` it prints
 * nothing and exits 0, so the check silently passes.
 *
 * @param options.paths - Files or directories to check (default: the project)
 * @returns The command to run
 */
export function biomeCiCommand({
	paths = [],
}: {
	paths?: string[];
} = {}): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-env",
			"--allow-run",
			"@biomejs/biome",
			"ci",
			...paths,
		],
	};
}

/**
 * A publish-readiness run (see `readiness.ts`):
 * - `doc-lint`: `deno doc --lint` per workspace member over its export set,
 *   which is what JSR documents
 * - `static`: README/LICENSE, exports, imports, `publish.exclude`,
 *   Given/When/Then and README/JSDoc specifier checks
 *
 * Known failures are allowlisted in `src/readiness/allowlisted.ts`.
 *
 * @param mode - Which checks to run
 * @returns The command to run
 */
export function readinessCommand(mode: "doc-lint" | "static"): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-read",
			"--allow-env",
			"--allow-run=deno",
			fromFileUrl(new URL("./readiness.ts", import.meta.url)),
			mode,
		],
	};
}

/**
 * `dv validate` over `.dv/` (config and Records), through `deno task dv`:
 * the same pinned, `--frozen` dv the release workflow runs, so the step
 * never depends on a `dv` binary being installed.
 *
 * @returns The command to run
 */
export function dvValidateCommand(): StepCommand {
	return { program: "deno", args: ["task", "--quiet", "dv", "validate"] };
}

/**
 * The CI workflow's steps for an environment:
 * - Parallel linting (Deno lint, Biome check, per-package documentation lint,
 *   publish readiness, generated-main freshness, `dv validate`, JSR dry run)
 * - Type checking
 * - Testing with coverage
 * - Coverage reporting
 * - Local cleanup of coverage data
 *
 * Every step has its own entry in {@linkcode EXIT_CODES}.
 */
export function ciSteps({ isCI, isAI }: CIEnvironment): WorkflowStep[] {
	return [
		// Parallel linting (no dependencies, will run concurrently)
		{
			name: "Deno Lint",
			exitCode: EXIT_CODES.DENO_LINT_FAILED,

			command: { program: "deno", args: ["lint"] },
		},
		{
			name: "Deno Check",
			exitCode: EXIT_CODES.DENO_CHECK_FAILED,

			command: { program: "deno", args: ["check"] },
		},
		{
			name: "Biome Check",
			exitCode: EXIT_CODES.BIOME_CHECK_FAILED,

			command: biomeCiCommand(),
		},
		{
			name: "Documentation Lint",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.DOC_LINT_FAILED,

			command: readinessCommand("doc-lint"),
		},
		{
			name: "Publish Readiness",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.PUBLISH_READINESS_FAILED,

			command: readinessCommand("static"),
		},
		{
			name: "Generated Main Freshness",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.GENERATED_MAIN_STALE,

			command: { program: "deno", args: ["task", "gen:main", "--check"] },
		},
		{
			name: "dv Validate",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.DV_VALIDATE_FAILED,

			command: dvValidateCommand(),
		},
		{
			name: "JSR Publish Dry Run",
			exitCode: EXIT_CODES.JSR_DRY_RUN_FAILED,

			command: {
				program: "deno",
				args: ["publish", "--dry-run", ...(isAI ? ["--allow-dirty"] : [])],
			},
		},

		// Run tests (blocked if lint fails)
		{
			name: "Deno Test",
			dependsOn: ["Deno Lint"],
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.TESTS_FAILED,

			command: {
				program: "deno",
				args: [
					"test",
					// Also type-checks and runs the code blocks in JSDoc and in every
					// markdown file (READMEs, docs/), unless fenced as `ignore`
					"--doc",
					"--parallel",
					"--no-prompt",
					"--allow-env",
					"--allow-read",
					"--allow-write",
					"--allow-run",
					"--coverage",
					// Drop profiles left by an earlier run whose cleanup did not run
					"--clean",
				],
			},
		},

		// Show coverage report (blocked if tests failed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: true,
			exitCode: EXIT_CODES.COVERAGE_FAILED,

			command: { program: "deno", args: ["coverage", "--detailed"] },
		},

		// Coverage table on the GitHub job summary, or totals in the AI JSON;
		// reads the coverage/lcov.info that Deno Test wrote
		{
			name: "Coverage Summary",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.COVERAGE_SUMMARY_FAILED,

			command: coverageSummaryCommand(isCI ? "github" : "json"),
			...(isCI ? {} : { captureOutputs: coverageOutputs }),
		},

		// Local cleanup (runs even if tests failed); CI keeps the coverage data
		...(isCI ? [] : [cleanupStep()]),
	];
}

/**
 * The coverage summary over `coverage/lcov.info` (see `coverage-summary.ts`):
 * `github` appends a markdown table to the job summary, `json` prints the
 * totals for {@linkcode coverageOutputs}.
 *
 * @param format - Where the summary goes
 * @returns The command to run
 */
export function coverageSummaryCommand(format: "github" | "json"): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-read",
			"--allow-write",
			"--allow-env",
			fromFileUrl(new URL("./coverage-summary.ts", import.meta.url)),
			format,
		],
	};
}

/**
 * Captures the JSON totals that `coverage-summary.ts json` prints as the
 * step's `coverage` output, which the AI JSON carries. Output that is not
 * JSON is captured as `coverageError` instead.
 *
 * @param output - The coverage summary command's output
 * @returns The step outputs
 */
export function coverageOutputs(output: Deno.CommandOutput): StepOutputs {
	const stdout = new TextDecoder().decode(output.stdout);
	try {
		return { context: { coverage: JSON.parse(stdout) } };
	} catch {
		return { context: { coverageError: `not JSON: ${stdout.slice(0, 200)}` } };
	}
}

function cleanupStep(): WorkflowStep {
	return {
		name: "Cleanup coverage data",
		dependsOn: ["Show coverage report", "Coverage Summary"],
		continueOnError: true,
		condition: "always",
		exitCode: EXIT_CODES.CLEANUP_FAILED,

		command: coverageCleanupCommand(),
	};
}

/**
 * Removes the coverage directory: the profiles and the lcov/HTML reports
 * that `deno test --coverage` writes. Succeeds when the directory is absent,
 * as when a lint failure blocked the tests.
 *
 * @param options.dir - The coverage directory (default: `coverage`)
 * @returns The command to run
 */
export function coverageCleanupCommand({
	dir = "coverage",
}: {
	dir?: string;
} = {}): StepCommand {
	return { program: "rm", args: ["-rf", dir] };
}

/**
 * Main entry point for the CI workflow. Reads the environment and runs
 * {@linkcode ciSteps}.
 */
export async function main(): Promise<void> {
	await runWorkflow(
		ciSteps({
			isCI: Deno.env.get("CI") === "true",
			isAI: Deno.env.get("CI_AI") === "true",
		}),
	);
}

if (import.meta.main) {
	await main();
}
