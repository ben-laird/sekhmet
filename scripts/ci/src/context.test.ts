import { assertEquals } from "@std/assert";
import { createStepContext } from "./context.ts";
import type { AccumulatedOutputs, StepResult } from "./types.ts";

Deno.test("createStepContext creates context with empty steps", () => {
	// Given: empty completed steps
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};
	const artifactsDir = "/tmp/test-artifacts";

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir,
	});

	// Then: context should be properly initialized
	assertEquals(context.steps.size, 0);
	assertEquals(context.outputs.env.size, 0);
	assertEquals(context.outputs.context.size, 0);
	assertEquals(context.outputs.artifactsDir, artifactsDir);
	assertEquals(context.allSucceeded(), true);
	assertEquals(context.hasFailure(), false);
});

Deno.test("createStepContext tracks passed steps", () => {
	// Given: one passed step
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "passed" }],
	]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: context should reflect the passed step
	assertEquals(context.steps.get("Build"), "passed");
	assertEquals(context.succeeded("Build"), true);
	assertEquals(context.failed("Build"), false);
	assertEquals(context.allSucceeded(), true);
	assertEquals(context.hasFailure(), false);
});

Deno.test("createStepContext tracks failed steps", () => {
	// Given: one failed step
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "failed" }],
	]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: context should reflect the failed step
	assertEquals(context.steps.get("Build"), "failed");
	assertEquals(context.succeeded("Build"), false);
	assertEquals(context.failed("Build"), true);
	assertEquals(context.allSucceeded(), false);
	assertEquals(context.hasFailure(), true);
});

Deno.test("createStepContext tracks skipped steps", () => {
	// Given: one skipped step
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "skipped" }],
	]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: context should reflect the skipped step
	assertEquals(context.steps.get("Build"), "skipped");
	assertEquals(context.succeeded("Build"), false);
	assertEquals(context.failed("Build"), false);
	assertEquals(context.allSucceeded(), true);
	assertEquals(context.hasFailure(), false);
});

Deno.test("createStepContext handles multiple mixed steps", () => {
	// Given: multiple steps with different statuses
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "passed" }],
		["Lint", { name: "Lint", status: "failed" }],
		["Deploy", { name: "Deploy", status: "skipped" }],
	]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: context should track all steps correctly
	assertEquals(context.steps.size, 3);
	assertEquals(context.succeeded("Build"), true);
	assertEquals(context.failed("Lint"), true);
	assertEquals(context.steps.get("Deploy"), "skipped");
	assertEquals(context.allSucceeded(), false);
	assertEquals(context.hasFailure(), true);
});

Deno.test("createStepContext includes accumulated outputs", () => {
	// Given: accumulated outputs with env and context data
	const completedSteps = new Map<string, StepResult>();
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map([
			["NODE_ENV", "production"],
			["API_KEY", "secret-key"],
		]),
		context: new Map<string, unknown>([
			["buildNumber", 42],
			["version", "1.2.3"],
		]),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: outputs should be accessible
	assertEquals(context.outputs.env.get("NODE_ENV"), "production");
	assertEquals(context.outputs.env.get("API_KEY"), "secret-key");
	assertEquals(context.outputs.context.get("buildNumber"), 42);
	assertEquals(context.outputs.context.get("version"), "1.2.3");
});

Deno.test("createStepContext provides immutable step statuses", () => {
	// Given: completed steps
	const completedSteps = new Map<string, StepResult>([
		["Build", { name: "Build", status: "passed" }],
	]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: new Map(),
		context: new Map(),
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Then: the steps map should be readonly (type-level guarantee)
	// We can verify it's a proper Map
	assertEquals(context.steps instanceof Map, true);
	assertEquals(context.steps.size, 1);
});

Deno.test("createStepContext provides immutable outputs", () => {
	// Given: accumulated outputs
	const completedSteps = new Map<string, StepResult>();
	const originalEnv = new Map([["KEY", "value"]]);
	const originalContext = new Map([["data", "test"]]);
	const accumulatedOutputs: AccumulatedOutputs = {
		env: originalEnv,
		context: originalContext,
	};

	// When: creating a step context
	const context = createStepContext({
		completedSteps,
		accumulatedOutputs,
		artifactsDir: "/tmp",
	});

	// Modify the original
	originalEnv.set("KEY", "modified");
	originalContext.set("data", "modified");

	// Then: context outputs should not be affected (they are copies)
	assertEquals(context.outputs.env.get("KEY"), "value");
	assertEquals(context.outputs.context.get("data"), "test");
});

Deno.test("createStepContext succeeded() returns false for non-existent step", () => {
	// Given: context with no steps
	const context = createStepContext({
		completedSteps: new Map(),
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking a non-existent step
	const result = context.succeeded("NonExistent");

	// Then: should return false
	assertEquals(result, false);
});

Deno.test("createStepContext failed() returns false for non-existent step", () => {
	// Given: context with no steps
	const context = createStepContext({
		completedSteps: new Map(),
		accumulatedOutputs: { env: new Map(), context: new Map() },
		artifactsDir: "/tmp",
	});

	// When: checking a non-existent step
	const result = context.failed("NonExistent");

	// Then: should return false
	assertEquals(result, false);
});
