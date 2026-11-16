// deno-coverage-ignore-file
import { bold, cyan, green, red } from "@std/fmt/colors";
import { createAdapter } from "./adapter.ts";
import { executeStepGraph } from "./graph.ts";
import { formatAIOutput, formatWorkflowOutput } from "./output.ts";
import type { WorkflowResult, WorkflowStep } from "./types.ts";

/**
 * Runs a workflow of steps with dependency resolution, conditional execution,
 * and output sharing capabilities.
 *
 * @param steps - Array of workflow steps to execute
 * @returns WorkflowResult containing success status and step results
 */
export async function runWorkflow(
	steps: WorkflowStep[],
): Promise<WorkflowResult> {
	const adapter = createAdapter();

	// Use grouping in GitHub Actions, plain output locally; AI mode keeps
	// stdout pure JSON
	if (!adapter.isAI) {
		await adapter.group("Running workflow", () => {
			console.log(cyan(bold("Running workflow...\n")));
		});
	}

	// Create artifacts directory
	const artifactsDir = await Deno.makeTempDir({ prefix: "ci-artifacts-" });

	try {
		const results = await executeStepGraph(steps, artifactsDir);
		const decoder = new TextDecoder();

		// AI mode: output structured JSON
		if (adapter.isAI) {
			const aiResult = formatAIOutput(steps, results, decoder);
			console.log(JSON.stringify(aiResult, null, 2));
			Deno.exit(aiResult.exitCode);
		}

		// Standard mode: format and display results
		const exitCode = await formatWorkflowOutput(
			steps,
			results,
			decoder,
			adapter,
		);

		if (exitCode !== 0) {
			adapter.error("Workflow failed");
			console.error(red(bold("\nWorkflow failed")));
			Deno.exit(exitCode);
		} else {
			adapter.notice("Workflow completed successfully");
			console.log(green(bold("\nWorkflow completed successfully")));
		}

		return {
			success: exitCode === 0,
			steps: Array.from(results.values()),
		};
	} finally {
		// Cleanup artifacts directory
		try {
			await Deno.remove(artifactsDir, { recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	}
}
