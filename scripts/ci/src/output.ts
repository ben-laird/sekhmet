// deno-coverage-ignore-file
import { cyan, gray, green, red, yellow } from "@std/fmt/colors";
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
	/** The step's workflow exit code, present when the step failed */
	exitCode?: number | undefined;
	/** The time limit the step hit, in milliseconds, present when it timed out */
	timedOutAfterMs?: number | undefined;
	/** true when the step failed but has `continueOnError`, so the workflow did not fail */
	continuedOnError?: boolean | undefined;
	/** The unhealthy dependencies that blocked the step, present when blocked */
	blockedBy?: string[] | undefined;
	/** Structured data the step captured (its `captureOutputs` context), if any */
	outputs?: Record<string, unknown> | undefined;
	/** Standard output from the step */
	stdout?: string | undefined;
	/** Standard error from the step */
	stderr?: string | undefined;
}

/**
 * JSON output for the entire workflow in AI mode.
 */
export interface AIWorkflowResult {
	/** false if any step without `continueOnError` failed, else true */
	success: boolean;
	/** The process exit code: 0, or the first failed step's exit code */
	exitCode: number;
	/** Results for each step in execution order */
	steps: AIStepResult[];
}

/**
 * Looks up a step's result, panicking if the graph never recorded one.
 */
function resultFor(
	step: WorkflowStep,
	results: Map<string, StepResult>,
): StepResult {
	const result = results.get(step.name);
	if (!result) {
		throw new Error(`Step "${step.name}" did not complete`);
	}
	return result;
}

/**
 * The exit code a failed step contributes: its timeout's `exitCode` when it
 * timed out, else its `exitCode` (default `1`).
 */
export function stepExitCode({
	step,
	result,
}: {
	step: WorkflowStep;
	result: StepResult;
}): number {
	const timedOut =
		result.status === "failed" && result.timedOutAfterMs !== undefined;
	if (timedOut && step.timeout) return step.timeout.exitCode;
	return step.exitCode ?? 1;
}

/**
 * The exit code a workflow ends with: `0` when no step failed, otherwise the
 * {@linkcode stepExitCode} of the first failed step in declaration order.
 * Blocked and skipped steps never set the code; the failure that blocked them
 * already has. A failed `continueOnError` step does not fail the workflow.
 */
export function workflowExitCode({
	steps,
	results,
}: {
	steps: WorkflowStep[];
	results: Map<string, StepResult>;
}): number {
	for (const step of steps) {
		const result = resultFor(step, results);
		if (result.status === "failed" && !step.continueOnError) {
			return stepExitCode({ step, result });
		}
	}
	return 0;
}

/**
 * Renders the one-line status of a step for console and GitHub Actions logs,
 * e.g. `[-] Show coverage report (blocked: "Deno Test" failed or was blocked)`.
 */
export function formatStepStatusLine({
	step,
	result,
}: {
	step: WorkflowStep;
	result: StepResult;
}): string {
	switch (result.status) {
		case "passed": {
			return `${green("[x]")} ${result.name}`;
		}
		case "failed": {
			const timedOut =
				result.timedOutAfterMs === undefined
					? ""
					: ` ${red(`(timed out after ${result.timedOutAfterMs / 1000} s; its process tree was killed)`)}`;
			const continued = step.continueOnError
				? ` ${yellow("(continueOnError: workflow not failed)")}`
				: "";
			return `${red("[!]")} ${result.name}${timedOut}${continued}`;
		}
		case "skipped": {
			return `${cyan("[ ]")} ${result.name} ${gray("(skipped: condition not met)")}`;
		}
		case "blocked": {
			const dependencies = result.blockedBy
				.map((name) => `"${name}"`)
				.join(", ");
			return `${yellow("[-]")} ${result.name} ${yellow(`(blocked: ${dependencies} failed or was blocked)`)}`;
		}
	}
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
	for (const step of steps) {
		const result = resultFor(step, results);

		console.log(formatStepStatusLine({ step, result }));

		if (result.status !== "passed" && result.status !== "failed") continue;

		// Show output if configured
		const output = result.output;
		if (output && shouldShowOutput(step, result.status)) {
			await adapter.group(result.name, () => {
				const stderr = decoder.decode(output.stderr);
				if (stderr) console.error(stderr);

				const stdout = decoder.decode(output.stdout);
				if (stdout) console.log(stdout);
			});
		}

		// Show captured outputs
		const exported = Object.keys(result.outputs?.env ?? {});
		if (exported.length > 0) {
			console.log(`  ${gray("Exported:")} ${exported.join(", ")}`);
		}
	}

	return workflowExitCode({ steps, results });
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
	const stepResults: AIStepResult[] = steps.map((step) => {
		const result = resultFor(step, results);
		const aiStep: AIStepResult = { name: result.name, status: result.status };

		switch (result.status) {
			case "skipped": {
				return aiStep;
			}
			case "blocked": {
				aiStep.blockedBy = result.blockedBy;
				return aiStep;
			}
			case "failed": {
				aiStep.exitCode = stepExitCode({ step, result });
				if (result.timedOutAfterMs !== undefined) {
					aiStep.timedOutAfterMs = result.timedOutAfterMs;
				}
				if (step.continueOnError) aiStep.continuedOnError = true;
				break;
			}
			case "passed": {
				break;
			}
		}

		const context = result.outputs?.context;
		if (context && Object.keys(context).length > 0) {
			aiStep.outputs = context;
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

		return aiStep;
	});

	const exitCode = workflowExitCode({ steps, results });
	return { success: exitCode === 0, exitCode, steps: stepResults };
}
