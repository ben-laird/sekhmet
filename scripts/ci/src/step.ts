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

	const gate = gateStep({ step, context });
	switch (gate.kind) {
		case "skipped": {
			return { name: step.name, status: "skipped" };
		}
		case "blocked": {
			return { name: step.name, status: "blocked", blockedBy: gate.blockedBy };
		}
		case "run": {
			break;
		}
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
 * Decision on whether a step runs, made before its command executes.
 */
export type StepGate =
	| { kind: "run" }
	| { kind: "skipped" }
	| { kind: "blocked"; blockedBy: string[] };

/**
 * Decides whether a step runs, from its condition and the outcomes of its
 * `dependsOn` steps (see `StepCondition`).
 *
 * A failed or blocked dependency blocks a `"success"` or function-condition
 * step, so blocking propagates down the graph. Only `"failure"` and
 * `"always"` steps run after an unhealthy dependency.
 */
export function gateStep({
	step,
	context,
}: {
	step: WorkflowStep;
	context: StepContext;
}): StepGate {
	const blockedBy = (step.dependsOn ?? []).filter((dependency) => {
		const status = context.steps.get(dependency);
		return status === "failed" || status === "blocked";
	});
	const condition = step.condition ?? "success";

	if (condition === "always") return { kind: "run" };
	if (condition === "failure") {
		return blockedBy.length > 0 ? { kind: "run" } : { kind: "skipped" };
	}
	if (blockedBy.length > 0) return { kind: "blocked", blockedBy };
	if (condition === "success") return { kind: "run" };
	return condition(context) ? { kind: "run" } : { kind: "skipped" };
}

/**
 * Determines whether to show output for a step.
 */
export function shouldShowOutput(
	step: WorkflowStep,
	status: StepStatus,
): boolean {
	if (status === "skipped" || status === "blocked") return false;

	if (typeof step.showOutput === "function") {
		return step.showOutput(status);
	}

	return step.showOutput ?? status === "failed";
}
