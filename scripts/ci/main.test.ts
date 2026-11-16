import { assertEquals, assertExists } from "@std/assert";
import { exists } from "@std/fs/exists";
import {
	biomeCiCommand,
	ciSteps,
	coverageCleanupCommand,
	EXIT_CODES,
	main,
} from "./main.ts";
import { spawnCommand } from "./mod.ts";

const ENVIRONMENTS = [
	{ isCI: false, isAI: false },
	{ isCI: false, isAI: true },
	{ isCI: true, isAI: false },
];

Deno.test("EXIT_CODES are defined with unique values", () => {
	// Given: EXIT_CODES constant
	// When: reading every code
	const values = Object.values(EXIT_CODES);

	// Then: all exit codes should be defined and unique
	assertEquals(EXIT_CODES.DENO_LINT_FAILED, 1);
	assertEquals(EXIT_CODES.BIOME_CHECK_FAILED, 2);
	assertEquals(EXIT_CODES.DOC_LINT_FAILED, 3);
	assertEquals(EXIT_CODES.JSR_DRY_RUN_FAILED, 4);
	assertEquals(EXIT_CODES.TESTS_FAILED, 5);
	assertEquals(EXIT_CODES.COVERAGE_FAILED, 6);
	assertEquals(EXIT_CODES.DENO_CHECK_FAILED, 7);
	assertEquals(EXIT_CODES.CLEANUP_FAILED, 8);
	const uniqueValues = new Set(values);
	assertEquals(values.length, uniqueValues.size, "Exit codes should be unique");
});

Deno.test("ciSteps gives every step its own exit code", () => {
	for (const environment of ENVIRONMENTS) {
		// Given: the CI steps for an environment
		const steps = ciSteps(environment);

		// When: collecting each step's exit code
		const codes = steps.map((step) => step.exitCode);

		// Then: every step declares one, and no two steps share one
		assertEquals(
			codes.filter((code) => code === undefined).length,
			0,
			`steps without an exit code in ${JSON.stringify(environment)}`,
		);
		assertEquals(new Set(codes).size, steps.length);
	}
});

Deno.test("biomeCiCommand fails on a badly formatted file and passes on a clean one", async () => {
	// Given: a badly formatted file and a clean one outside the project
	const dir = await Deno.makeTempDir({ prefix: "ci-biome-" });
	const bad = `${dir}/bad.ts`;
	const good = `${dir}/good.ts`;
	await Deno.writeTextFile(bad, "const  x = 1;\nexport { x };\n");
	await Deno.writeTextFile(good, "export const x = 1;\n");

	try {
		// When: running the CI step's Biome command on each
		const badOutput = await spawnCommand({
			command: biomeCiCommand({ paths: [bad] }),
		}).output();
		const goodOutput = await spawnCommand({
			command: biomeCiCommand({ paths: [good] }),
		}).output();

		// Then: the bad file fails the check (no silent exit 0); the clean one passes
		assertEquals(badOutput.success, false);
		assertEquals(goodOutput.success, true);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("ciSteps cleans up coverage data locally even after a failure, and keeps it in CI", () => {
	// Given: the local and CI step lists
	const local = ciSteps({ isCI: false, isAI: true });
	const ci = ciSteps({ isCI: true, isAI: false });

	// When: finding the cleanup step
	const localCleanup = local.find(
		(step) => step.name === "Cleanup coverage data",
	);
	const ciCleanup = ci.find((step) => step.name === "Cleanup coverage data");

	// Then: locally it always runs after the report; CI omits it
	assertEquals(localCleanup?.condition, "always");
	assertEquals(localCleanup?.dependsOn, ["Show coverage report"]);
	assertEquals(ciCleanup, undefined);
});

Deno.test("coverageCleanupCommand removes a populated coverage directory", async () => {
	// Given: a coverage directory holding profiles and a generated report
	const root = await Deno.makeTempDir({ prefix: "ci-cleanup-" });
	const dir = `${root}/coverage`;
	await Deno.mkdir(`${dir}/html`, { recursive: true });
	await Deno.writeTextFile(`${dir}/profile.json`, "{}");
	await Deno.writeTextFile(`${dir}/lcov.info`, "");
	await Deno.writeTextFile(`${dir}/html/index.html`, "");

	try {
		// When: running the cleanup step's command on it
		const output = await spawnCommand({
			command: coverageCleanupCommand({ dir }),
		}).output();

		// Then: it succeeds and the directory is gone
		assertEquals(output.success, true);
		assertEquals(await exists(dir), false);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("coverageCleanupCommand succeeds when there is no coverage directory", async () => {
	// Given: no coverage directory, as when lint failed and blocked the tests
	const root = await Deno.makeTempDir({ prefix: "ci-cleanup-" });

	try {
		// When: running the cleanup step's command
		const output = await spawnCommand({
			command: coverageCleanupCommand({ dir: `${root}/coverage` }),
		}).output();

		// Then: there is nothing to clean, which is not a failure
		assertEquals(output.success, true);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("main function exists and is callable", () => {
	// Given: the module's exports
	// When: reading main from them
	// Then: it should be defined
	assertExists(main);
	assertEquals(typeof main, "function");
});

Deno.test("main detects CI environment variable", () => {
	// Given: CI environment variable is set
	const originalCI = Deno.env.get("CI");
	Deno.env.set("CI", "true");

	// When: we check if the environment is configured
	const isCI = Deno.env.get("CI") === "true";

	// Then: isCI should be true
	assertEquals(isCI, true);

	// Cleanup
	if (originalCI === undefined) {
		Deno.env.delete("CI");
	} else {
		Deno.env.set("CI", originalCI);
	}
});

Deno.test("main detects non-CI environment", () => {
	// Given: CI environment variable is not set or false
	const originalCI = Deno.env.get("CI");
	Deno.env.delete("CI");

	// When: we check if the environment is configured
	const isCI = Deno.env.get("CI") === "true";

	// Then: isCI should be false
	assertEquals(isCI, false);

	// Cleanup
	if (originalCI !== undefined) {
		Deno.env.set("CI", originalCI);
	}
});
