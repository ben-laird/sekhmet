import { executeStep } from "./step.ts";
import type { AccumulatedOutputs, StepResult, WorkflowStep } from "./types.ts";

/**
 * Executes a workflow step graph with dependency resolution.
 *
 * Each step runs exactly once, after every step in its `dependsOn` has reached
 * its final status, so its gate sees those final statuses. Steps whose
 * dependencies allow it run in parallel.
 *
 * Panics (throws) on a malformed graph (a duplicate name, a missing
 * dependency or a dependency cycle) before any step runs.
 */
export async function executeStepGraph(
	steps: WorkflowStep[],
	artifactsDir: string,
): Promise<Map<string, StepResult>> {
	const stepMap = indexSteps(steps);
	assertAcyclic(stepMap);

	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map<string, string>(),
		context: new Map<string, unknown>(),
	};
	const runs = new Map<string, Promise<void>>();

	await Promise.all(steps.map(run));

	return completedSteps;

	function run(step: WorkflowStep): Promise<void> {
		const existing = runs.get(step.name);
		if (existing) return existing;
		const started = runAfterDependencies(step);
		runs.set(step.name, started);
		return started;
	}

	async function runAfterDependencies(step: WorkflowStep): Promise<void> {
		await Promise.all(
			(step.dependsOn ?? []).map((name) => run(lookup({ stepMap, name }))),
		);

		const result = await executeStep({
			step,
			completedSteps,
			accumulatedOutputs,
			artifactsDir,
		});
		completedSteps.set(step.name, result);

		// Accumulate outputs for next steps
		if (result.status !== "passed" && result.status !== "failed") return;
		for (const [key, value] of Object.entries(result.outputs?.env ?? {})) {
			accumulatedOutputs.env.set(key, value);
		}
		for (const [key, value] of Object.entries(result.outputs?.context ?? {})) {
			accumulatedOutputs.context.set(key, value);
		}
	}
}

function indexSteps(steps: WorkflowStep[]): Map<string, WorkflowStep> {
	const stepMap = new Map<string, WorkflowStep>();
	for (const step of steps) {
		if (stepMap.has(step.name)) {
			throw new Error(`Duplicate step name: "${step.name}"`);
		}
		stepMap.set(step.name, step);
	}
	for (const step of steps) {
		for (const name of step.dependsOn ?? []) {
			if (!stepMap.has(name)) {
				throw new Error(
					`Step "${step.name}" depends on "${name}", but no such step exists`,
				);
			}
		}
	}
	return stepMap;
}

function lookup({
	stepMap,
	name,
}: {
	stepMap: ReadonlyMap<string, WorkflowStep>;
	name: string;
}): WorkflowStep {
	const step = stepMap.get(name);
	// deno-coverage-ignore-start
	if (!step) throw new Error(`Unknown step "${name}" passed validation`);
	// deno-coverage-ignore-stop
	return step;
}

function assertAcyclic(stepMap: ReadonlyMap<string, WorkflowStep>): void {
	const finished = new Set<string>();
	const path: string[] = [];

	for (const name of stepMap.keys()) visit(name);

	function visit(name: string): void {
		if (finished.has(name)) return;
		const start = path.indexOf(name);
		if (start >= 0) {
			const cycle = [...path.slice(start), name].map((n) => `"${n}"`);
			throw new Error(`Dependency cycle: ${cycle.join(" -> ")}`);
		}
		path.push(name);
		for (const dependency of lookup({ stepMap, name }).dependsOn ?? []) {
			visit(dependency);
		}
		path.pop();
		finished.add(name);
	}
}
