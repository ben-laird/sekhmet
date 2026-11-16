import { createStepContext } from "./context.ts";
import type {
	StepCommand,
	StepContext,
	StepExecution,
	StepResult,
	StepStatus,
	WorkflowStep,
} from "./types.ts";

/**
 * Executes a single workflow step. Its process gets `ARTIFACTS_DIR` and the
 * accumulated `env` outputs (see {@linkcode stepEnv}); the runner's env is
 * never mutated, so parallel steps cannot race on it.
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

	const output = await spawnCommand({
		command: step.command,
		env: stepEnv({ artifactsDir, accumulatedEnv: accumulatedOutputs.env }),
	}).output();

	return {
		name: step.name,
		status: output.success ? "passed" : "failed",
		output,
		outputs: step.captureOutputs?.(output, context),
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
 * Builds the `Deno.Command` for a {@linkcode StepCommand}. `env` is added to
 * the spawned process only; the runner's own env is never touched.
 *
 * @param options.command - The command to build
 * @param options.env - Extra env vars for the process (default: none)
 * @returns The command, ready to spawn
 */
export function spawnCommand({
	command,
	env = {},
}: {
	command: StepCommand;
	env?: Record<string, string>;
}): Deno.Command {
	return new Deno.Command(command.program, {
		args: [...(command.args ?? [])],
		env,
		...(command.cwd === undefined ? {} : { cwd: command.cwd }),
	});
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
