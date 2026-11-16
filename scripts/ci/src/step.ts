import { createStepContext } from "./context.ts";
import { runCommand } from "./process.ts";
import type {
	StepContext,
	StepExecution,
	StepResult,
	StepStatus,
	WorkflowStep,
} from "./types.ts";

/**
 * Executes a single workflow step. Its process gets `ARTIFACTS_DIR` and the
 * accumulated `env` outputs (see {@linkcode stepEnv}); the runner's env is
 * never mutated, so parallel steps cannot race on it. A step with a `timeout`
 * that its command outlives fails with `timedOutAfterMs` set.
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

	const run = await runCommand({
		command: step.command,
		env: stepEnv({ artifactsDir, accumulatedEnv: accumulatedOutputs.env }),
		timeoutMs: step.timeout?.ms,
	});
	const { output } = run;

	return {
		name: step.name,
		status: run.kind === "exited" && output.success ? "passed" : "failed",
		output,
		outputs: step.captureOutputs?.(output, context),
		...(run.kind === "timed-out" ? { timedOutAfterMs: run.afterMs } : {}),
	};
}

/**
 * The env a step's process gets on top of the inherited process env: earlier
 * steps' `env` outputs, then `ARTIFACTS_DIR`.
 */
export function stepEnv({
	artifactsDir,
	accumulatedEnv,
}: {
	artifactsDir: string;
	accumulatedEnv: ReadonlyMap<string, string>;
}): Record<string, string> {
	return { ...Object.fromEntries(accumulatedEnv), ARTIFACTS_DIR: artifactsDir };
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
