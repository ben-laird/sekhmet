// deno-coverage-ignore-file
import { cyan, gray, green, red } from "@std/fmt/colors";
import type { CIAdapter } from "./adapter.ts";
import { shouldShowOutput } from "./step.ts";
import type { StepResult, StepStatus, WorkflowStep } from "./types.ts";

/**
 * JSON output for a single workflow step in AI mode.
 */
export interface AIStepResult {
	/** Name of the step */
	name: string;
	/** Execution status */
	status: StepStatus;
	/** Exit code if the step failed */
	exitCode?: number | undefined;
	/** Standard output from the step */
	stdout?: string | undefined;
	/** Standard error from the step */
	stderr?: string | undefined;
}

/**
 * JSON output for the entire workflow in AI mode.
 */
export interface AIWorkflowResult {
	/** true if all steps passed, false if any failed */
	success: boolean;
	/** Results for each step in execution order */
	steps: AIStepResult[];
}

/**
 * Formats and displays workflow results to the console.
 * Returns the exit code to use (0 for success, specific code for first failure).
 */
export async function formatWorkflowOutput(
	steps: WorkflowStep[],
	results: Map<string, StepResult>,
	decoder: TextDecoder,
	adapter: CIAdapter,
): Promise<number> {
	let exitCode = 0;

	for (const step of steps) {
		const result = results.get(step.name);
		if (!result) {
			throw new Error(`Step "${step.name}" did not complete`);
		}

		// Display status
		const statusSymbol = (() => {
			switch (result.status) {
				case "passed": {
					return green("[x]");
				}
				case "failed": {
					return red("[!]");
				}
				case "skipped": {
					return cyan("[ ]");
				}
			}
		})();

		console.log(`${statusSymbol} ${result.name}`);

		// Show output if configured
		if (result.output && shouldShowOutput(step, result.status)) {
			const output = result.output;
			await adapter.group(result.name, () => {
				const stderr = decoder.decode(output.stderr);
				if (stderr) console.error(stderr);

				const stdout = decoder.decode(output.stdout);
				if (stdout) console.log(stdout);
			});
		}

		// Show captured outputs
		if (result.outputs?.env && Object.keys(result.outputs.env).length > 0) {
			console.log(
				`  ${gray("Exported:")} ${Object.keys(result.outputs.env).join(", ")}`,
			);
		}

		// Track first failure's exit code
		if (result.status === "failed" && exitCode === 0) {
			exitCode = step.exitCode ?? 1;
		}
	}

	return exitCode;
}

/**
 * Formats workflow results as structured JSON for AI agents.
 * Respects the showOutput configuration for each step.
 *
 * @param steps - Workflow step configurations
 * @param results - Map of step results
 * @param decoder - TextDecoder for converting output bytes to strings
 * @returns Structured workflow result object
 */
export function formatAIOutput(
	steps: WorkflowStep[],
	results: Map<string, StepResult>,
	decoder: TextDecoder,
): AIWorkflowResult {
	let success = true;
	const stepResults: AIStepResult[] = [];

	for (const step of steps) {
		const result = results.get(step.name);
		if (!result) {
			throw new Error(`Step "${step.name}" did not complete`);
		}

		const aiStep: AIStepResult = {
			name: result.name,
			status: result.status,
		};

		if (result.status === "failed") {
			success = false;
			aiStep.exitCode = step.exitCode ?? 1;
		}

		// Include output if configured to show
		if (result.output && shouldShowOutput(step, result.status)) {
			const stdout = decoder.decode(result.output.stdout);
			const stderr = decoder.decode(result.output.stderr);

			if (stdout) {
				aiStep.stdout = stdout;
			}
			if (stderr) {
				aiStep.stderr = stderr;
			}
		}

		stepResults.push(aiStep);
	}

	return {
		success,
		steps: stepResults,
	};
}
