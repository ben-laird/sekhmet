import { bold, cyan, green, red } from "@std/fmt/colors";
import { executeStepGraph } from "./graph.ts";
import { formatWorkflowOutput } from "./output.ts";
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
	console.log(cyan(bold("Running workflow...\n")));

	// Create artifacts directory
	const artifactsDir = await Deno.makeTempDir({ prefix: "ci-artifacts-" });

	try {
		const results = await executeStepGraph(steps, artifactsDir);

		// Format and display results
		const decoder = new TextDecoder();
		const failed = formatWorkflowOutput(steps, results, decoder);

		if (failed) {
			console.error(red(bold("\nWorkflow failed")));
			Deno.exit(1);
		} else {
			console.log(green(bold("\nWorkflow completed successfully")));
		}

		return {
			success: !failed,
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
