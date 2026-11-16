import { assertEquals } from "@std/assert";
import { stripAnsiCode } from "@std/fmt/colors";
import {
	formatAIOutput,
	formatStepStatusLine,
	workflowExitCode,
} from "./output.ts";
import type { StepResult, WorkflowStep } from "./types.ts";

const command = new Deno.Command("true");

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

Deno.test("formatStepStatusLine marks each status distinctly for console and GitHub Actions logs", () => {
	// Given: one result of each status
	const lines = [...results.values()].map((result) =>
		stripAnsiCode(formatStepStatusLine(result)),
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

Deno.test("formatAIOutput reports blocked and skipped steps", () => {
	// Given: the results after a failed test step
	// When: formatting for AI agents
	const output = formatAIOutput(steps, results, new TextDecoder());

	// Then: the workflow failed, and each step says what happened
	assertEquals(output, {
		success: false,
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
