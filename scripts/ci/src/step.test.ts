import { assertEquals } from "@std/assert";
import { createStepContext } from "./context.ts";
import { executeStep, gateStep, shouldShowOutput } from "./step.ts";
import { ranResult } from "./testing.ts";
import type {
	AccumulatedOutputs,
	StepCommand,
	StepContext,
	StepResult,
	StepStatus,
	WorkflowStep,
} from "./types.ts";

// Helper to create a mock command that succeeds
function createMockCommand(success = true): StepCommand {
	return { program: "echo", args: success ? ["success"] : ["failure"] };
}

// Helper to build a context from completed step statuses
function contextOf(results: StepResult[]): StepContext {
	return createStepContext({
		completedSteps: new Map(results.map((result) => [result.name, result])),
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});
}

Deno.test("gateStep runs a success-condition step when every dependency passed or was skipped", () => {
	// Given: a success-condition step whose dependencies passed and skipped
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "success",
		dependsOn: ["Dep1", "Dep2"],
	};
	const context = contextOf([
		{ name: "Dep1", status: "passed" },
		{ name: "Dep2", status: "skipped" },
	]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it runs
	assertEquals(gate, { kind: "run" });
});

Deno.test("gateStep blocks a success-condition step whose dependency failed", () => {
	// Given: a success-condition step with one failed dependency
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "success",
		dependsOn: ["Dep1", "Dep2"],
	};
	const context = contextOf([
		{ name: "Dep1", status: "passed" },
		{ name: "Dep2", status: "failed" },
	]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it is blocked by the failed dependency
	assertEquals(gate, { kind: "blocked", blockedBy: ["Dep2"] });
});

Deno.test("gateStep blocks a step whose dependency was itself blocked", () => {
	// Given: a step depending on a blocked step
	const step: WorkflowStep = {
		name: "Cleanup",
		command: createMockCommand(),
		dependsOn: ["Report"],
	};
	const context = contextOf([
		{ name: "Report", status: "blocked", blockedBy: ["Test"] },
	]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: blocking propagates
	assertEquals(gate, { kind: "blocked", blockedBy: ["Report"] });
});

Deno.test("gateStep ignores failures of steps that are not dependencies", () => {
	// Given: a step with no dependencies while an unrelated step has failed
	const step: WorkflowStep = { name: "Test", command: createMockCommand() };
	const context = contextOf([{ name: "Unrelated", status: "failed" }]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it runs, since only dependencies gate a step
	assertEquals(gate, { kind: "run" });
});

Deno.test("gateStep defaults to the success condition when not specified", () => {
	// Given: a step without an explicit condition and a failed dependency
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		dependsOn: ["Dep1"],
	};
	const context = contextOf([{ name: "Dep1", status: "failed" }]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it is blocked, as with "success"
	assertEquals(gate, { kind: "blocked", blockedBy: ["Dep1"] });
});

Deno.test("gateStep blocks a function-condition step whose dependency failed, without calling it", () => {
	// Given: a function-condition step that would run, and a failed dependency
	let called = false;
	const step: WorkflowStep = {
		name: "Show coverage report",
		command: createMockCommand(),
		dependsOn: ["Deno Test"],
		condition: () => {
			called = true;
			return true;
		},
	};
	const context = contextOf([{ name: "Deno Test", status: "failed" }]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it is blocked and the condition was never consulted
	assertEquals(gate, { kind: "blocked", blockedBy: ["Deno Test"] });
	assertEquals(called, false);
});

Deno.test("gateStep runs or skips a function-condition step with healthy dependencies", () => {
	// Given: function-condition steps with a passed dependency
	const context = contextOf([{ name: "Build", status: "passed" }]);
	const stepWith = (
		condition: (ctx: StepContext) => boolean,
	): WorkflowStep => ({
		name: "Test",
		command: createMockCommand(),
		dependsOn: ["Build"],
		condition,
	});

	// When: gating with a condition that holds
	const runs = gateStep({
		step: stepWith((ctx) => ctx.succeeded("Build")),
		context,
	});
	// Then: it runs
	assertEquals(runs, { kind: "run" });

	// When: gating with a condition that does not hold
	const skips = gateStep({ step: stepWith(() => false), context });
	// Then: it is skipped
	assertEquals(skips, { kind: "skipped" });
});

Deno.test("gateStep runs a failure-condition step only after an unhealthy dependency", () => {
	// Given: a failure-condition step
	const step: WorkflowStep = {
		name: "Report failure",
		command: createMockCommand(),
		condition: "failure",
		dependsOn: ["Dep1"],
	};

	// When: its dependency failed
	const afterFailure = gateStep({
		step,
		context: contextOf([{ name: "Dep1", status: "failed" }]),
	});
	// Then: it runs
	assertEquals(afterFailure, { kind: "run" });

	// When: its dependency was blocked
	const afterBlocked = gateStep({
		step,
		context: contextOf([
			{ name: "Dep1", status: "blocked", blockedBy: ["Dep0"] },
		]),
	});
	// Then: it runs
	assertEquals(afterBlocked, { kind: "run" });

	// When: its dependency passed
	const afterPass = gateStep({
		step,
		context: contextOf([{ name: "Dep1", status: "passed" }]),
	});
	// Then: it is skipped
	assertEquals(afterPass, { kind: "skipped" });
});

Deno.test("gateStep runs an always-condition step even after a failed dependency", () => {
	// Given: an always-condition step with a failed dependency
	const step: WorkflowStep = {
		name: "Cleanup",
		command: createMockCommand(),
		condition: "always",
		dependsOn: ["Dep1"],
	};
	const context = contextOf([{ name: "Dep1", status: "failed" }]);

	// When: gating the step
	const gate = gateStep({ step, context });

	// Then: it runs
	assertEquals(gate, { kind: "run" });
});

Deno.test("shouldShowOutput returns false for skipped steps", () => {
	// Given: a skipped step
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
	};
	const status: StepStatus = "skipped";

	// When: checking if output should be shown
	const result = shouldShowOutput(step, status);

	// Then: should return false
	assertEquals(result, false);
});

Deno.test("shouldShowOutput returns true for failed steps by default", () => {
	// Given: a failed step without showOutput config
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
	};
	const status: StepStatus = "failed";

	// When: checking if output should be shown
	const result = shouldShowOutput(step, status);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldShowOutput returns false for passed steps by default", () => {
	// Given: a passed step without showOutput config
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
	};
	const status: StepStatus = "passed";

	// When: checking if output should be shown
	const result = shouldShowOutput(step, status);

	// Then: should return false
	assertEquals(result, false);
});

Deno.test("shouldShowOutput uses boolean showOutput config", () => {
	// Given: a step with showOutput set to true
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		showOutput: true,
	};
	const status: StepStatus = "passed";

	// When: checking if output should be shown
	const result = shouldShowOutput(step, status);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldShowOutput uses function showOutput config", () => {
	// Given: a step with showOutput function that checks status
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		showOutput: (status: StepStatus) => status === "passed",
	};
	const status: StepStatus = "passed";

	// When: checking if output should be shown
	const result = shouldShowOutput(step, status);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("executeStep returns skipped status when condition is false", async () => {
	// Given: a step with condition that returns false
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: () => false,
	};
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: executing the step
	const result = await executeStep({
		step,
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: should return skipped status
	assertEquals(result, { name: "Test", status: "skipped" });
});

Deno.test("executeStep returns passed status for successful command", async () => {
	// Given: a step with a successful command
	const step: WorkflowStep = {
		name: "Test",
		command: { program: "echo", args: ["success"] },
	};
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: executing the step
	const result = await executeStep({
		step,
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: should return passed status
	assertEquals(result.name, "Test");
	assertEquals(result.status, "passed");
	assertEquals(ranResult(result).output?.success, true);
});

Deno.test("executeStep returns failed status for failing command", async () => {
	// Given: a step with a failing command
	const step: WorkflowStep = {
		name: "Test",
		command: { program: "sh", args: ["-c", "exit 1"] },
	};
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: executing the step
	const result = await executeStep({
		step,
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: should return failed status
	assertEquals(result.name, "Test");
	assertEquals(result.status, "failed");
	assertEquals(ranResult(result).output?.success, false);
});

Deno.test("executeStep sets ARTIFACTS_DIR environment variable", async () => {
	// Given: a step that echoes the ARTIFACTS_DIR
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });
	const step: WorkflowStep = {
		name: "Test",
		command: { program: "sh", args: ["-c", "echo $ARTIFACTS_DIR"] },
	};
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	try {
		// When: executing the step
		const result = await executeStep({
			step,
			completedSteps,
			accumulatedOutputs,
			artifactsDir,
		});

		// Then: ARTIFACTS_DIR should be set correctly
		assertEquals(result.status, "passed");
		const output = new TextDecoder()
			.decode(ranResult(result).output?.stdout)
			.trim();
		assertEquals(output, artifactsDir);
	} finally {
		// Cleanup
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStep gives the command the accumulated env without changing the process env", async () => {
	// Given: a process env var that an earlier step's output overrides
	const originalValue = Deno.env.get("TEST_VAR");
	Deno.env.set("TEST_VAR", "original");
	const step: WorkflowStep = {
		name: "Test",
		command: { program: "sh", args: ["-c", 'printf "%s" "$TEST_VAR"'] },
	};
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map([["TEST_VAR", "modified"]]),
		context: new Map(),
	};

	try {
		// When: executing the step
		const result = await executeStep({
			step,
			completedSteps: new Map(),
			accumulatedOutputs,
			artifactsDir: "/tmp",
		});

		// Then: the command saw the override, and the process env never changed
		assertEquals(
			new TextDecoder().decode(ranResult(result).output?.stdout),
			"modified",
		);
		assertEquals(Deno.env.get("TEST_VAR"), "original");
	} finally {
		if (originalValue === undefined) {
			Deno.env.delete("TEST_VAR");
		} else {
			Deno.env.set("TEST_VAR", originalValue);
		}
	}
});

Deno.test("executeStep captures outputs when captureOutputs is defined", async () => {
	// Given: a step with captureOutputs function
	const step: WorkflowStep = {
		name: "Test",
		command: { program: "echo", args: ["test"] },
		captureOutputs: (_output) => ({
			env: { TEST_ENV: "value" },
			context: { testData: 42 },
		}),
	};
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: executing the step
	const result = await executeStep({
		step,
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: outputs should be captured
	assertEquals(ranResult(result).outputs?.env?.TEST_ENV, "value");
	assertEquals(ranResult(result).outputs?.context?.testData, 42);
});

Deno.test("executeStep gives parallel steps their own env without touching the process env", async () => {
	// Given: two steps run in parallel, each with its own accumulated env var;
	// the first is still running when the second starts
	const before = Deno.env.get("ONLY_FIRST");
	const first = executeStep({
		step: {
			name: "First",
			command: {
				program: "sh",
				args: ["-c", 'sleep 0.2; printf "%s|%s" "$ONLY_FIRST" "$ONLY_SECOND"'],
			},
		},
		completedSteps: new Map(),
		accumulatedOutputs: {
			env: new Map([["ONLY_FIRST", "first"]]),
			context: new Map(),
		},
		artifactsDir: "/tmp/first",
	});
	const second = executeStep({
		step: {
			name: "Second",
			command: {
				program: "sh",
				args: ["-c", 'printf "%s|%s" "$ONLY_FIRST" "$ONLY_SECOND"'],
			},
		},
		completedSteps: new Map(),
		accumulatedOutputs: {
			env: new Map([["ONLY_SECOND", "second"]]),
			context: new Map(),
		},
		artifactsDir: "/tmp/second",
	});

	// When: both finish
	const [firstResult, secondResult] = await Promise.all([first, second]);

	// Then: each saw only its own var, and the process env is unchanged
	const decoder = new TextDecoder();
	assertEquals(decoder.decode(ranResult(firstResult).output?.stdout), "first|");
	assertEquals(
		decoder.decode(ranResult(secondResult).output?.stdout),
		"|second",
	);
	assertEquals(Deno.env.get("ONLY_FIRST"), before);
});
