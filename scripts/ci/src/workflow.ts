// deno-coverage-ignore-file
import { bold, cyan, green, red } from "@std/fmt/colors";
import { type CIAdapter, createAdapter } from "./adapter.ts";
import { executeStepGraph } from "./graph.ts";
import { formatAIOutput, formatWorkflowOutput } from "./output.ts";
import type { StepResult, WorkflowResult, WorkflowStep } from "./types.ts";

/**
 * Runs a workflow of steps with dependency resolution, conditional execution,
 * and output sharing capabilities, and reports the results (JSON on stdout in
 * AI mode). It never exits the process: the caller ends it with the result's
 * `exitCode`.
 *
 * @param steps - Array of workflow steps to execute
 * @returns The success status, the exit code and every step's result
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
		const exitCode = await reportResults({ steps, results, decoder, adapter });
		return {
			success: exitCode === 0,
			exitCode,
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

/**
 * Prints the results: structured JSON in AI mode, else a status line per
 * step and a verdict.
 *
 * @returns The workflow's exit code
 */
async function reportResults({
	steps,
	results,
	decoder,
	adapter,
}: {
	steps: WorkflowStep[];
	results: Map<string, StepResult>;
	decoder: TextDecoder;
	adapter: CIAdapter;
}): Promise<number> {
	if (adapter.isAI) {
		const aiResult = formatAIOutput(steps, results, decoder);
		console.log(JSON.stringify(aiResult, null, 2));
		return aiResult.exitCode;
	}

	const exitCode = await formatWorkflowOutput(steps, results, decoder, adapter);
	if (exitCode !== 0) {
		adapter.error("Workflow failed");
		console.error(red(bold("\nWorkflow failed")));
	} else {
		adapter.notice("Workflow completed successfully");
		console.log(green(bold("\nWorkflow completed successfully")));
	}
	return exitCode;
}
