import type { StepContext, StepContextParams, StepStatus } from "./types.ts";

/**
 * Creates a StepContext for condition evaluation and output access.
 */
export function createStepContext({
	completedSteps,
	accumulatedOutputs,
	artifactsDir,
}: StepContextParams): StepContext {
	const stepStatuses = new Map<string, StepStatus>();
	for (const [name, result] of completedSteps.entries()) {
		stepStatuses.set(name, result.status);
	}

	return {
		steps: stepStatuses,
		outputs: {
			env: new Map(accumulatedOutputs.env),
			context: new Map(accumulatedOutputs.context),
			artifactsDir,
		},
		hasFailure: () => {
			for (const status of stepStatuses.values()) {
				if (status === "failed") return true;
			}
			return false;
		},
		allSucceeded: () => {
			for (const status of stepStatuses.values()) {
				if (status === "failed") return false;
			}
			return true;
		},
		succeeded: (stepName: string) => stepStatuses.get(stepName) === "passed",
		failed: (stepName: string) => stepStatuses.get(stepName) === "failed",
	};
}
