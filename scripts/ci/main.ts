// deno-coverage-ignore-file
import { runWorkflow, type WorkflowStep } from "@/mod.ts";

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
 * The environment the CI workflow adapts to.
 */
export interface CIEnvironment {
	/** Running in a CI service (`CI=true`) */
	isCI: boolean;
	/** Running for an AI agent (`CI_AI=true`) */
	isAI: boolean;
}

/**
 * The CI workflow's steps for an environment:
 * - Parallel linting (Deno lint, Biome check, documentation lint, JSR dry run)
 * - Type checking
 * - Testing with coverage
 * - Coverage reporting
 * - Local cleanup of coverage data
 */
export function ciSteps({ isCI, isAI }: CIEnvironment): WorkflowStep[] {
	return [
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

		// Run tests (blocked if lint fails)
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

		// Show coverage report (blocked if tests failed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: true,
			exitCode: EXIT_CODES.COVERAGE_FAILED,

			command: new Deno.Command("deno", { args: ["coverage", "--detailed"] }),
		},

		// Local cleanup (runs even if tests failed); CI keeps the coverage data
		...(isCI ? [] : [cleanupStep()]),
	];
}

function cleanupStep(): WorkflowStep {
	return {
		name: "Cleanup coverage data",
		dependsOn: ["Show coverage report"],
		continueOnError: true,
		condition: "always",

		command: new Deno.Command("rm", { args: ["-r", "coverage"] }),
	};
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
