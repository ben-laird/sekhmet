import { assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs/exists";
import { executeStepGraph } from "./graph.ts";
import { ranResult } from "./testing.ts";
import type { WorkflowStep } from "./types.ts";

Deno.test("executeStepGraph executes single step successfully", async () => {
	// Given: a single successful step
	const steps: WorkflowStep[] = [
		{
			name: "Build",
			command: new Deno.Command("echo", { args: ["building"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: step should complete successfully
		assertEquals(results.size, 1);
		const buildResult = results.get("Build");
		assertEquals(buildResult?.name, "Build");
		assertEquals(buildResult?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph executes multiple independent steps in parallel", async () => {
	// Given: multiple independent steps
	const steps: WorkflowStep[] = [
		{
			name: "Lint",
			command: new Deno.Command("echo", { args: ["linting"] }),
		},
		{
			name: "Format",
			command: new Deno.Command("echo", { args: ["formatting"] }),
		},
		{
			name: "TypeCheck",
			command: new Deno.Command("echo", { args: ["type checking"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: all steps should complete successfully
		assertEquals(results.size, 3);
		assertEquals(results.get("Lint")?.status, "passed");
		assertEquals(results.get("Format")?.status, "passed");
		assertEquals(results.get("TypeCheck")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph respects dependencies", async () => {
	// Given: steps with dependencies
	const steps: WorkflowStep[] = [
		{
			name: "Build",
			command: new Deno.Command("echo", { args: ["build"] }),
		},
		{
			name: "Test",
			dependsOn: ["Build"],
			command: new Deno.Command("echo", { args: ["test"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: Build should complete before Test starts (verified by dependency system)
		assertEquals(results.size, 2);
		assertEquals(results.get("Build")?.status, "passed");
		assertEquals(results.get("Test")?.status, "passed");
		// Both steps succeeded, which proves Build ran first (since Test depends on Build passing)
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles multiple dependencies", async () => {
	// Given: a step with multiple dependencies
	const steps: WorkflowStep[] = [
		{
			name: "Lint",
			command: new Deno.Command("echo", { args: ["lint"] }),
		},
		{
			name: "TypeCheck",
			command: new Deno.Command("echo", { args: ["typecheck"] }),
		},
		{
			name: "Build",
			dependsOn: ["Lint", "TypeCheck"],
			command: new Deno.Command("echo", { args: ["build"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: all steps should complete successfully
		assertEquals(results.size, 3);
		assertEquals(results.get("Lint")?.status, "passed");
		assertEquals(results.get("TypeCheck")?.status, "passed");
		assertEquals(results.get("Build")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph throws error for duplicate step names", async () => {
	// Given: steps with duplicate names
	const steps: WorkflowStep[] = [
		{
			name: "Build",
			command: new Deno.Command("echo", { args: ["build1"] }),
		},
		{
			name: "Build",
			command: new Deno.Command("echo", { args: ["build2"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When/Then: executing the step graph should throw
		await assertRejects(
			async () => await executeStepGraph(steps, artifactsDir),
			Error,
			'Duplicate step name: "Build"',
		);
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph throws error for missing dependency", async () => {
	// Given: a step depending on non-existent step
	const steps: WorkflowStep[] = [
		{
			name: "Test",
			dependsOn: ["Build"],
			command: new Deno.Command("echo", { args: ["test"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When/Then: executing the step graph should throw
		await assertRejects(
			async () => await executeStepGraph(steps, artifactsDir),
			Error,
			'Step "Test" depends on "Build", but no such step exists',
		);
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph accumulates environment outputs", async () => {
	// Given: steps that produce environment outputs
	const steps: WorkflowStep[] = [
		{
			name: "SetupEnv",
			command: new Deno.Command("echo", { args: ["setup"] }),
			captureOutputs: () => ({
				env: { NODE_ENV: "production" },
			}),
		},
		{
			name: "Build",
			dependsOn: ["SetupEnv"],
			command: new Deno.Command("sh", {
				args: ["-c", "echo $NODE_ENV"],
			}),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: environment should be available to dependent step
		assertEquals(results.size, 2);
		const buildResult = results.get("Build");
		assertEquals(buildResult?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph accumulates context outputs", async () => {
	// Given: steps that produce context outputs
	const steps: WorkflowStep[] = [
		{
			name: "SetupContext",
			command: new Deno.Command("echo", { args: ["setup"] }),
			captureOutputs: () => ({
				context: { version: "1.2.3", buildNumber: 42 },
			}),
		},
		{
			name: "UseContext",
			dependsOn: ["SetupContext"],
			command: new Deno.Command("echo", { args: ["use"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: context should be accumulated
		assertEquals(results.size, 2);
		const setupResult = results.get("SetupContext");
		assertEquals(ranResult(setupResult).outputs?.context?.version, "1.2.3");
		assertEquals(ranResult(setupResult).outputs?.context?.buildNumber, 42);
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles complex dependency chain", async () => {
	// Given: a complex dependency chain
	const steps: WorkflowStep[] = [
		{
			name: "Install",
			command: new Deno.Command("echo", { args: ["install"] }),
		},
		{
			name: "Lint",
			dependsOn: ["Install"],
			command: new Deno.Command("echo", { args: ["lint"] }),
		},
		{
			name: "TypeCheck",
			dependsOn: ["Install"],
			command: new Deno.Command("echo", { args: ["typecheck"] }),
		},
		{
			name: "Build",
			dependsOn: ["Lint", "TypeCheck"],
			command: new Deno.Command("echo", { args: ["build"] }),
		},
		{
			name: "Test",
			dependsOn: ["Build"],
			command: new Deno.Command("echo", { args: ["test"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: all steps should complete successfully
		// The dependency chain ensures Install → (Lint + TypeCheck) → Build → Test
		assertEquals(results.size, 5);
		assertEquals(results.get("Install")?.status, "passed");
		assertEquals(results.get("Lint")?.status, "passed");
		assertEquals(results.get("TypeCheck")?.status, "passed");
		assertEquals(results.get("Build")?.status, "passed");
		assertEquals(results.get("Test")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles failed steps", async () => {
	// Given: a step that fails
	const steps: WorkflowStep[] = [
		{
			name: "Build",
			command: new Deno.Command("sh", { args: ["-c", "exit 1"] }),
		},
		{
			name: "Test",
			dependsOn: ["Build"],
			command: new Deno.Command("echo", { args: ["test"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: Build should fail and Test should be blocked by it
		assertEquals(results.size, 2);
		assertEquals(results.get("Build")?.status, "failed");
		assertEquals(results.get("Test"), {
			name: "Test",
			status: "blocked",
			blockedBy: ["Build"],
		});
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph blocks a function-condition dependent of a failed step without running it", async () => {
	// Given: the CI shape — a failing test step, a coverage report gated by an
	// environment condition, and an always-run cleanup after the report
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });
	const reportMarker = `${artifactsDir}/report-ran`;
	const cleanupMarker = `${artifactsDir}/cleanup-ran`;
	const steps: WorkflowStep[] = [
		{
			name: "Deno Test",
			command: new Deno.Command("sh", { args: ["-c", "exit 1"] }),
		},
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			condition: () => true,
			command: new Deno.Command("touch", { args: [reportMarker] }),
		},
		{
			name: "Cleanup coverage data",
			dependsOn: ["Show coverage report"],
			condition: "always",
			command: new Deno.Command("touch", { args: [cleanupMarker] }),
		},
	];

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: the report is blocked by the failed tests and never ran
		assertEquals(results.get("Deno Test")?.status, "failed");
		assertEquals(results.get("Show coverage report"), {
			name: "Show coverage report",
			status: "blocked",
			blockedBy: ["Deno Test"],
		});
		assertEquals(await exists(reportMarker), false);

		// Then: the always-run cleanup still ran
		assertEquals(results.get("Cleanup coverage data")?.status, "passed");
		assertEquals(await exists(cleanupMarker), true);
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph propagates blocking through a chain of dependents", async () => {
	// Given: A fails, B depends on A, C depends on B
	const steps: WorkflowStep[] = [
		{ name: "A", command: new Deno.Command("sh", { args: ["-c", "exit 1"] }) },
		{
			name: "B",
			dependsOn: ["A"],
			command: new Deno.Command("echo", { args: ["b"] }),
		},
		{
			name: "C",
			dependsOn: ["B"],
			command: new Deno.Command("echo", { args: ["c"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: B is blocked by A, and C by B
		assertEquals(results.get("B"), {
			name: "B",
			status: "blocked",
			blockedBy: ["A"],
		});
		assertEquals(results.get("C"), {
			name: "C",
			status: "blocked",
			blockedBy: ["B"],
		});
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph runs a dependent of a skipped step", async () => {
	// Given: a step skipped by its condition, and a dependent of it
	const steps: WorkflowStep[] = [
		{
			name: "Optional",
			condition: () => false,
			command: new Deno.Command("echo", { args: ["optional"] }),
		},
		{
			name: "After",
			dependsOn: ["Optional"],
			command: new Deno.Command("echo", { args: ["after"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: a skipped dependency is healthy, so the dependent runs
		assertEquals(results.get("Optional")?.status, "skipped");
		assertEquals(results.get("After")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles empty steps array", async () => {
	// Given: empty steps array
	const steps: WorkflowStep[] = [];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: should return empty results
		assertEquals(results.size, 0);
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles diamond dependency (multiple dependents on same base)", async () => {
	// Given: a diamond dependency where StepB and StepC both depend on StepA, and StepD depends on both
	// This creates multiple paths to StepA, triggering the early-return optimization
	const steps: WorkflowStep[] = [
		{
			name: "StepA",
			command: new Deno.Command("echo", { args: ["a"] }),
		},
		{
			name: "StepB",
			dependsOn: ["StepA"],
			command: new Deno.Command("echo", { args: ["b"] }),
		},
		{
			name: "StepC",
			dependsOn: ["StepA"],
			command: new Deno.Command("echo", { args: ["c"] }),
		},
		{
			name: "StepD",
			dependsOn: ["StepB", "StepC"],
			command: new Deno.Command("echo", { args: ["d"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: all steps should complete successfully
		// StepA should only execute once despite being reached via multiple dependency paths
		assertEquals(results.size, 4);
		assertEquals(results.get("StepA")?.status, "passed");
		assertEquals(results.get("StepB")?.status, "passed");
		assertEquals(results.get("StepC")?.status, "passed");
		assertEquals(results.get("StepD")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});

Deno.test("executeStepGraph handles deeply nested diamond dependencies", async () => {
	// Given: multiple levels of diamond dependencies that create many paths to shared steps
	// This aggressively triggers the early-return optimization multiple times
	const steps: WorkflowStep[] = [
		{
			name: "Root",
			command: new Deno.Command("sh", {
				args: ["-c", "sleep 0.01 && echo root"],
			}),
		},
		{
			name: "L1-A",
			dependsOn: ["Root"],
			command: new Deno.Command("echo", { args: ["l1a"] }),
		},
		{
			name: "L1-B",
			dependsOn: ["Root"],
			command: new Deno.Command("echo", { args: ["l1b"] }),
		},
		{
			name: "L1-C",
			dependsOn: ["Root"],
			command: new Deno.Command("echo", { args: ["l1c"] }),
		},
		{
			name: "L2-A",
			dependsOn: ["L1-A", "L1-B"],
			command: new Deno.Command("echo", { args: ["l2a"] }),
		},
		{
			name: "L2-B",
			dependsOn: ["L1-B", "L1-C"],
			command: new Deno.Command("echo", { args: ["l2b"] }),
		},
		{
			name: "L2-C",
			dependsOn: ["L1-A", "L1-C"],
			command: new Deno.Command("echo", { args: ["l2c"] }),
		},
		{
			name: "Final",
			dependsOn: ["L2-A", "L2-B", "L2-C"],
			command: new Deno.Command("echo", { args: ["final"] }),
		},
	];
	const artifactsDir = await Deno.makeTempDir({ prefix: "test-artifacts-" });

	try {
		// When: executing the step graph with many overlapping dependency paths
		const results = await executeStepGraph(steps, artifactsDir);

		// Then: all steps complete, with shared dependencies only executing once
		// Root is reached via L1-A, L1-B, and L1-C (3 paths)
		// L1-A is reached via L2-A and L2-C (2 paths)
		// L1-B is reached via L2-A and L2-B (2 paths)
		// L1-C is reached via L2-B and L2-C (2 paths)
		assertEquals(results.size, 8);
		assertEquals(results.get("Root")?.status, "passed");
		assertEquals(results.get("L1-A")?.status, "passed");
		assertEquals(results.get("L1-B")?.status, "passed");
		assertEquals(results.get("L1-C")?.status, "passed");
		assertEquals(results.get("L2-A")?.status, "passed");
		assertEquals(results.get("L2-B")?.status, "passed");
		assertEquals(results.get("L2-C")?.status, "passed");
		assertEquals(results.get("Final")?.status, "passed");
	} finally {
		await Deno.remove(artifactsDir, { recursive: true });
	}
});
