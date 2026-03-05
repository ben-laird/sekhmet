// deno-coverage-ignore-file
import { runWorkflow } from "@/mod.ts";

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
} as const;

/**
 * Main entry point for the CI workflow.
 * Runs a comprehensive continuous integration workflow including:
 * - Parallel linting (Deno lint, Biome check, documentation lint, JSR dry run)
 * - Type checking
 * - Testing with coverage
 * - Coverage reporting
 * - Cleanup
 *
 * The workflow adapts behavior based on the CI environment variable.
 */
export async function main(): Promise<void> {
	const isCI = Deno.env.get("CI") === "true";
	const isAI = Deno.env.get("CI_AI") === "true";

	await runWorkflow([
		// Parallel linting (no dependencies, will run concurrently)
		{
			name: "Deno Lint",
			exitCode: EXIT_CODES.DENO_LINT_FAILED,

			command: new Deno.Command("deno", { args: ["lint"] }),
		},
		{
			name: "Deno Check",
			exitCode: EXIT_CODES.DENO_LINT_FAILED,

			command: new Deno.Command("deno", { args: ["check"] }),
		},
		{
			name: "Biome Check",
			exitCode: EXIT_CODES.BIOME_CHECK_FAILED,

			command: new Deno.Command("deno", {
				args: ["run", "--no-prompt", "--allow-env", "@biomejs/biome", "ci"],
			}),
		},
		{
			name: "Documentation Lint",
			exitCode: EXIT_CODES.DOC_LINT_FAILED,

			command: new Deno.Command("deno", {
				args: ["doc", "--lint", "./**/*.ts"],
			}),
		},
		{
			name: "JSR Publish Dry Run",
			exitCode: EXIT_CODES.JSR_DRY_RUN_FAILED,

			command: new Deno.Command("deno", {
				args: (() => {
					const args = ["publish", "--dry-run"];

					if (isAI) {
						args.push("--allow-dirty");
					}

					return args;
				})(),
			}),
		},

		// Run tests (waits for lint to pass first)
		{
			name: "Deno Test",
			dependsOn: ["Deno Lint"],
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.TESTS_FAILED,

			command: new Deno.Command("deno", {
				args: [
					"test",
					"--doc",
					"--parallel",
					"--no-prompt",
					"--allow-env",
					"--allow-read",
					"--allow-write",
					"--allow-run",
					"--coverage",
				],
			}),
		},

		// Show coverage report (only if tests passed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: true,
			exitCode: EXIT_CODES.COVERAGE_FAILED,

			command: new Deno.Command("deno", { args: ["coverage", "--detailed"] }),
		},

		// Cleanup (always runs, even if tests failed)
		{
			name: "Cleanup coverage data",
			dependsOn: ["Show coverage report"],
			continueOnError: true,
			condition: () => !isCI,

			command: new Deno.Command("rm", { args: ["-r", "coverage"] }),
		},
	]);
}

if (import.meta.main) {
	await main();
}
