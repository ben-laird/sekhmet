import { runWorkflow } from "@/mod.ts";

/**
 * Exit codes for CI workflow failures.
 * Each step has a unique exit code to identify which step failed.
 */
export const EXIT_CODES = {
	DENO_LINT_FAILED: 1,
	BIOME_CHECK_FAILED: 2,
	TESTS_FAILED: 3,
	COVERAGE_FAILED: 4,
} as const;

export async function main(): Promise<void> {
	const isCI = Deno.env.get("CI") === "true";

	await runWorkflow([
		// Parallel linting (no dependencies, will run concurrently)
		{
			name: "Deno Lint",
			exitCode: EXIT_CODES.DENO_LINT_FAILED,

			command: new Deno.Command("deno", { args: ["lint"] }),
		},
		{
			name: "Biome Check",
			exitCode: EXIT_CODES.BIOME_CHECK_FAILED,

			command: new Deno.Command("deno", {
				args: ["run", "--allow-env", "@biomejs/biome", "ci"],
			}),
		},

		// Run tests (waits for lint to pass first)
		{
			name: "Deno Test",
			dependsOn: ["Deno Lint"],
			showOutput: (status) => isCI && status === "failed",
			exitCode: EXIT_CODES.TESTS_FAILED,

			command: new Deno.Command("deno", { args: ["test", "--coverage"] }),
		},

		// Show coverage report (only if tests passed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
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
