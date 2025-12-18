import { createStepContext } from "./context.ts";
import type {
	StepContext,
	StepExecution,
	StepOutputs,
	StepResult,
	StepStatus,
	WorkflowStep,
} from "./types.ts";

/**
 * Executes a single workflow step with environment variable injection.
 */
export async function executeStep({
	step,
	completedSteps,
	accumulatedOutputs,
	artifactsDir,
}: StepExecution): Promise<StepResult> {
	// Create context for condition evaluation
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir,
	});

	// Evaluate condition
	if (!shouldRunStep(step, context)) {
		return {
			name: step.name,
			status: "skipped",
		};
	}

	// Set environment variables for this step
	// Note: We modify the global env temporarily since Deno.Command captures it at creation
	const originalEnv: Record<string, string | undefined> = {};

	// Set ARTIFACTS_DIR
	originalEnv.ARTIFACTS_DIR = Deno.env.get("ARTIFACTS_DIR");
	Deno.env.set("ARTIFACTS_DIR", artifactsDir);

	// Set accumulated env outputs
	for (const [key, value] of accumulatedOutputs.env.entries()) {
		originalEnv[key] = Deno.env.get(key);
		Deno.env.set(key, value);
	}

	try {
		// Execute command with modified environment
		const output = await step.command.output();

		const status: StepStatus = output.success ? "passed" : "failed";

		// Capture outputs if configured
		let outputs: StepOutputs | undefined;
		if (step.captureOutputs) {
			outputs = step.captureOutputs(output, context);
		}

		return {
			name: step.name,
			status,
			output,
			outputs,
		};
	} finally {
		// Restore original environment
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				Deno.env.delete(key);
			} else {
				Deno.env.set(key, value);
			}
		}
	}
}

/**
 * Evaluates whether a step should run based on its condition.
 */
export function shouldRunStep(
	step: WorkflowStep,
	context: StepContext,
): boolean {
	const condition = step.condition ?? "success";

	if (typeof condition === "function") {
		return condition(context);
	}

	switch (condition) {
		case "success": {
			return context.allSucceeded();
		}
		case "failure": {
			return context.hasFailure();
		}
		case "always": {
			return true;
		}
	}
}

/**
 * Determines whether to show output for a step.
 */
export function shouldShowOutput(
	step: WorkflowStep,
	status: StepStatus,
): boolean {
	if (status === "skipped") return false;

	if (typeof step.showOutput === "function") {
		return step.showOutput(status);
	}

	return step.showOutput ?? status === "failed";
}
