import { assertEquals } from "@std/assert";
import { stripAnsiCode } from "@std/fmt/colors";
import {
	formatAIOutput,
	formatStepStatusLine,
	stepTimeoutMessage,
	workflowExitCode,
} from "./output.ts";
import type { StepResult, WorkflowStep } from "./types.ts";

const command = { program: "true" };

// The CI shape after "Deno Test" fails: the report is blocked, cleanup runs
const steps: WorkflowStep[] = [
	{ name: "Deno Lint", exitCode: 1, command },
	{ name: "Deno Test", exitCode: 5, dependsOn: ["Deno Lint"], command },
	{
		name: "Show coverage report",
		exitCode: 6,
		dependsOn: ["Deno Test"],
		command,
	},
	{ name: "Optional", exitCode: 9, condition: () => false, command },
];
const results = new Map<string, StepResult>([
	["Deno Lint", { name: "Deno Lint", status: "passed" }],
	["Deno Test", { name: "Deno Test", status: "failed" }],
	[
		"Show coverage report",
		{
			name: "Show coverage report",
			status: "blocked",
			blockedBy: ["Deno Test"],
		},
	],
	["Optional", { name: "Optional", status: "skipped" }],
]);

function ranOrNot(name: string): StepResult {
	const result = results.get(name);
	if (!result) throw new Error(`no fixture result for ${name}`);
	return result;
}

// Cleanup fails but has continueOnError; its dependent still sees the failure
const cleanupSteps: WorkflowStep[] = [
	{ name: "Deno Lint", exitCode: 1, command },
	{ name: "Cleanup", exitCode: 8, continueOnError: true, command },
	{ name: "After cleanup", exitCode: 9, dependsOn: ["Cleanup"], command },
];
const cleanupResults = new Map<string, StepResult>([
	["Deno Lint", { name: "Deno Lint", status: "passed" }],
	["Cleanup", { name: "Cleanup", status: "failed" }],
	[
		"After cleanup",
		{ name: "After cleanup", status: "blocked", blockedBy: ["Cleanup"] },
	],
]);

Deno.test("workflowExitCode does not fail the workflow for a failed continueOnError step", () => {
	// Given: only a continueOnError step failed (its dependent is blocked)
	// When: computing the workflow exit code
	const exitCode = workflowExitCode({
		steps: cleanupSteps,
		results: cleanupResults,
	});

	// Then: the workflow succeeds
	assertEquals(exitCode, 0);
});

Deno.test("workflowExitCode skips a continueOnError failure and reports the next real failure", () => {
	// Given: a continueOnError failure declared before a plain failure
	const mixedSteps: WorkflowStep[] = [
		{ name: "Cleanup", exitCode: 8, continueOnError: true, command },
		{ name: "Deno Test", exitCode: 5, command },
	];
	const mixed = new Map<string, StepResult>([
		["Cleanup", { name: "Cleanup", status: "failed" }],
		["Deno Test", { name: "Deno Test", status: "failed" }],
	]);

	// When: computing the workflow exit code
	const exitCode = workflowExitCode({ steps: mixedSteps, results: mixed });

	// Then: the plain failure's code
	assertEquals(exitCode, 5);
});

Deno.test("formatAIOutput and formatStepStatusLine flag a continued failure", () => {
	// Given: the continueOnError failure fixture
	const [, cleanupStep] = cleanupSteps;
	const cleanupResult = cleanupResults.get("Cleanup");
	if (!cleanupStep || !cleanupResult) throw new Error("fixture missing");

	// When: formatting for AI agents and for logs
	const output = formatAIOutput(
		cleanupSteps,
		cleanupResults,
		new TextDecoder(),
	);
	const line = stripAnsiCode(
		formatStepStatusLine({ step: cleanupStep, result: cleanupResult }),
	);

	// Then: the workflow succeeds, the step is marked as continued, and its dependent is blocked
	assertEquals(output.success, true);
	assertEquals(output.exitCode, 0);
	assertEquals(output.steps[1], {
		name: "Cleanup",
		status: "failed",
		exitCode: 8,
		continuedOnError: true,
	});
	assertEquals(output.steps[2]?.status, "blocked");
	assertEquals(line, "[!] Cleanup (continueOnError: workflow not failed)");
});

Deno.test("formatStepStatusLine marks each status distinctly for console and GitHub Actions logs", () => {
	// Given: one result of each status
	const lines = steps.map((step) =>
		stripAnsiCode(formatStepStatusLine({ step, result: ranOrNot(step.name) })),
	);

	// When/Then: each line names the step and says why a non-run step did not run
	assertEquals(lines, [
		"[x] Deno Lint",
		"[!] Deno Test",
		'[-] Show coverage report (blocked: "Deno Test" failed or was blocked)',
		"[ ] Optional (skipped: condition not met)",
	]);
});

Deno.test("workflowExitCode is the first failed step's code and ignores blocked steps", () => {
	// Given: a failed test step and the report it blocked
	// When: computing the workflow exit code
	const exitCode = workflowExitCode({ steps, results });

	// Then: the failed step's code, not the blocked step's
	assertEquals(exitCode, 5);
});

Deno.test("a timed-out step ends the workflow with its timeout's exit code and says it timed out", () => {
	// Given: a test step with a timeout whose command was killed at the limit
	const testStep: WorkflowStep = {
		name: "Deno Test",
		exitCode: 5,
		timeout: { ms: 300_000, exitCode: 13 },
		command,
	};
	const result: StepResult = {
		name: "Deno Test",
		status: "failed",
		timedOutAfterMs: 300_000,
	};
	const timedOut = new Map([["Deno Test", result]]);

	// When: computing the exit code and formatting for AI agents and for logs
	const exitCode = workflowExitCode({ steps: [testStep], results: timedOut });
	const output = formatAIOutput([testStep], timedOut, new TextDecoder());
	const line = stripAnsiCode(formatStepStatusLine({ step: testStep, result }));

	// Then: the timeout's code, not the failure's, and the message names the limit
	assertEquals(exitCode, 13);
	assertEquals(output.steps[0], {
		name: "Deno Test",
		status: "failed",
		exitCode: 13,
		timedOutAfterMs: 300_000,
	});
	assertEquals(
		line,
		"[!] Deno Test (timed out after 300 s; its process tree was killed)",
	);
});

Deno.test("a step with a timeout that fails without timing out keeps its failure exit code", () => {
	// Given: a test step with a timeout that failed on its own
	const testStep: WorkflowStep = {
		name: "Deno Test",
		exitCode: 5,
		timeout: { ms: 300_000, exitCode: 13 },
		command,
	};
	const failed = new Map<string, StepResult>([
		["Deno Test", { name: "Deno Test", status: "failed" }],
	]);

	// When: computing the workflow exit code
	const exitCode = workflowExitCode({ steps: [testStep], results: failed });

	// Then: the ordinary failure code
	assertEquals(exitCode, 5);
});

Deno.test("workflowExitCode is zero when nothing failed, even if steps were skipped", () => {
	// Given: a passed step and a skipped step
	const quiet = new Map<string, StepResult>([
		["Deno Lint", { name: "Deno Lint", status: "passed" }],
		["Optional", { name: "Optional", status: "skipped" }],
	]);
	const quietSteps = steps.filter((step) => quiet.has(step.name));

	// When: computing the workflow exit code
	const exitCode = workflowExitCode({ steps: quietSteps, results: quiet });

	// Then: success
	assertEquals(exitCode, 0);
});

Deno.test("formatAIOutput reports blocked and skipped steps, per-step exit codes and the workflow exit code", () => {
	// Given: the results after a failed test step
	// When: formatting for AI agents
	const output = formatAIOutput(steps, results, new TextDecoder());

	// Then: the workflow failed with the test step's code, and each step says what happened
	assertEquals(output, {
		success: false,
		exitCode: 5,
		steps: [
			{ name: "Deno Lint", status: "passed" },
			{ name: "Deno Test", status: "failed", exitCode: 5 },
			{
				name: "Show coverage report",
				status: "blocked",
				blockedBy: ["Deno Test"],
			},
			{ name: "Optional", status: "skipped" },
		],
	});
});

Deno.test("formatAIOutput carries a step's captured context as structured outputs, even when its stdout is hidden", () => {
	// Given: a passed step with hidden output that captured coverage totals
	const summaryStep: WorkflowStep = {
		name: "Coverage Summary",
		showOutput: false,
		command,
	};
	const coverage = { total: { lines: { covered: 9, total: 10 } } };
	const summaryResults = new Map<string, StepResult>([
		[
			"Coverage Summary",
			{
				name: "Coverage Summary",
				status: "passed",
				outputs: { context: { coverage } },
			},
		],
	]);

	// When: formatting for AI agents
	const output = formatAIOutput(
		[summaryStep],
		summaryResults,
		new TextDecoder(),
	);

	// Then: the totals are JSON in the step's outputs, not a string in stdout
	assertEquals(output.steps, [
		{ name: "Coverage Summary", status: "passed", outputs: { coverage } },
	]);
});

Deno.test("stepTimeoutMessage names the step, since steps share a timeout code", () => {
	// Given: two steps that hit the same shared time limit
	const afterMs = 600_000;

	// When: rendering each one's timeout message
	const lint = stepTimeoutMessage({ name: "Deno Lint", afterMs });
	const dryRun = stepTimeoutMessage({ name: "JSR Publish Dry Run", afterMs });

	// Then: each names its own step and the limit it hit
	assertEquals(
		lint,
		'"Deno Lint" timed out after 600 s; its process tree was killed',
	);
	assertEquals(
		dryRun,
		'"JSR Publish Dry Run" timed out after 600 s; its process tree was killed',
	);
});
