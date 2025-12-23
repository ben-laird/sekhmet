import { runWorkflow } from "@/mod.ts";

export async function main(): Promise<void> {
	const isCI = Deno.env.get("CI") === "true";

	await runWorkflow([
		// Parallel linting (no dependencies, will run concurrently)
		{
			name: "Deno Lint",
			command: new Deno.Command("deno", { args: ["lint"] }),
		},
		{
			name: "Biome Check",
			command: new Deno.Command("deno", {
				args: ["run", "--allow-env", "@biomejs/biome", "ci"],
			}),
		},

		// Run tests (waits for lint to pass first)
		{
			name: "Deno Test",
			dependsOn: ["Deno Lint"],
			showOutput: (status) => isCI && status === "failed",

			command: new Deno.Command("deno", { args: ["test", "--coverage"] }),
		},

		// Show coverage report (only if tests passed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			showOutput: true,

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
