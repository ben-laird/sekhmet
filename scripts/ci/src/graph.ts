import { executeStep } from "./step.ts";
import type { AccumulatedOutputs, StepResult, WorkflowStep } from "./types.ts";

/**
 * Executes a workflow step graph with dependency resolution.
 * Steps are executed in parallel where possible, respecting dependencies.
 */
export async function executeStepGraph(
	steps: WorkflowStep[],
	artifactsDir: string,
): Promise<Map<string, StepResult>> {
	const stepMap = new Map<string, WorkflowStep>();
	for (const step of steps) {
		if (stepMap.has(step.name)) {
			throw new Error(`Duplicate step name: "${step.name}"`);
		}
		stepMap.set(step.name, step);
	}

	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map<string, string>(),
		context: new Map<string, unknown>(),
	};

	// Execute steps with dependencies
	await Promise.all(steps.map((step) => executeStepWithDeps(step)));

	return completedSteps;

	async function executeStepWithDeps(step: WorkflowStep): Promise<void> {
		// Defensive early-return check (unreachable through normal execution)
		// deno-coverage-ignore-start
		if (completedSteps.has(step.name)) {
			return;
		}
		// deno-coverage-ignore-stop

		// Wait for dependencies
		if (step.dependsOn && step.dependsOn.length > 0) {
			await Promise.all(
				step.dependsOn.map((depName) => {
					const depStep = stepMap.get(depName);
					if (!depStep) {
						throw new Error(
							`Step "${step.name}" depends on "${depName}", but no such step exists`,
						);
					}
					return executeStepWithDeps(depStep);
				}),
			);
		}

		// Execute this step
		const result = await executeStep({
			step,
			completedSteps,
			accumulatedOutputs,
			artifactsDir,
		});
		completedSteps.set(step.name, result);

		// Accumulate outputs for next steps
		if (result.outputs?.env) {
			for (const [key, value] of Object.entries(result.outputs.env)) {
				accumulatedOutputs.env.set(key, value);
			}
		}
		if (result.outputs?.context) {
			for (const [key, value] of Object.entries(result.outputs.context)) {
				accumulatedOutputs.context.set(key, value);
			}
		}
	}
}
