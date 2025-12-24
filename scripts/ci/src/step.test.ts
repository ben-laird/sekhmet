import { assertEquals } from "@std/assert";
import { executeStep, shouldRunStep, shouldShowOutput } from "./step.ts";
import type {
	AccumulatedOutputs,
	StepContext,
	StepResult,
	StepStatus,
	WorkflowStep,
} from "./types.ts";
import { createStepContext } from "./context.ts";

// Helper to create a mock command that succeeds
function createMockCommand(success = true): Deno.Command {
	return new Deno.Command("echo", {
		args: success ? ["success"] : ["failure"],
	});
}


Deno.test("shouldRunStep returns true for success condition with all passed", () => {
	// Given: a step with success condition and all dependencies passed
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "success",
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "passed" }],
		["Dep2", { name: "Dep2", status: "passed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldRunStep returns false for success condition with failures", () => {
	// Given: a step with success condition and a failed dependency
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "success",
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "passed" }],
		["Dep2", { name: "Dep2", status: "failed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return false
	assertEquals(result, false);
});

Deno.test("shouldRunStep returns true for failure condition with failures", () => {
	// Given: a step with failure condition and a failed dependency
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "failure",
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "failed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldRunStep returns false for failure condition without failures", () => {
	// Given: a step with failure condition and no failed dependencies
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "failure",
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "passed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return false
	assertEquals(result, false);
});

Deno.test("shouldRunStep returns true for always condition", () => {
	// Given: a step with always condition
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: "always",
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "failed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldRunStep uses custom function condition", () => {
	// Given: a step with custom condition function
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
		condition: (ctx: StepContext) => ctx.succeeded("Build"),
	};
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "passed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return true
	assertEquals(result, true);
});

Deno.test("shouldRunStep defaults to success condition when not specified", () => {
	// Given: a step without explicit condition
	const step: WorkflowStep = {
		name: "Test",
		command: createMockCommand(),
	};
	const completedSteps = new Map<string, StepResult>([
		["Dep1", { name: "Dep1", status: "passed" }],
	]);
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking if step should run
	const result = shouldRunStep(step, context);

	// Then: should return true (defaults to success)
	assertEquals(result, true);
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
	assertEquals(result.name, "Test");
	assertEquals(result.status, "skipped");
	assertEquals(result.output, undefined);
});

Deno.test("executeStep returns passed status for successful command", async () => {
	// Given: a step with a successful command
	const step: WorkflowStep = {
		name: "Test",
		command: new Deno.Command("echo", { args: ["success"] }),
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
	assertEquals(result.output?.success, true);
});

Deno.test("executeStep returns failed status for failing command", async () => {
	// Given: a step with a failing command
	const step: WorkflowStep = {
		name: "Test",
		command: new Deno.Command("sh", {
			args: ["-c", "exit 1"],
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

	// Then: should return failed status
	assertEquals(result.name, "Test");
	assertEquals(result.status, "failed");
	assertEquals(result.output?.success, false);
});

Deno.test("executeStep sets ARTIFACTS_DIR environment variable", async () => {
	// Given: a step that echoes the ARTIFACTS_DIR
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });
	const step: WorkflowStep = {
		name: "Test",
		command: new Deno.Command("sh", {
			args: ["-c", "echo $ARTIFACTS_DIR"],
		}),
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
		const output = new TextDecoder().decode(result.output?.stdout).trim();
		assertEquals(output, artifactsDir);
	} finally {
		// Cleanup
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStep restores environment after execution", async () => {
	// Given: a step and an original environment variable
	const originalValue = Deno.env.get("TEST_VAR");
	Deno.env.set("TEST_VAR", "original");

	const step: WorkflowStep = {
		name: "Test",
		command: new Deno.Command("echo", { args: ["test"] }),
	};
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map([["TEST_VAR", "modified"]]),
		context: new Map(),
	};

	// When: executing the step
	await executeStep({
		step,
		completedSteps: new Map(),
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: environment should be restored
	assertEquals(Deno.env.get("TEST_VAR"), "original");

	// Cleanup
	if (originalValue === undefined) {
		Deno.env.delete("TEST_VAR");
	} else {
		Deno.env.set("TEST_VAR", originalValue);
	}
});

Deno.test("executeStep captures outputs when captureOutputs is defined", async () => {
	// Given: a step with captureOutputs function
	const step: WorkflowStep = {
		name: "Test",
		command: new Deno.Command("echo", { args: ["test"] }),
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
	assertEquals(result.outputs?.env?.TEST_ENV, "value");
	assertEquals(result.outputs?.context?.testData, 42);
});
