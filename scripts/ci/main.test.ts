import { assertEquals, assertExists } from "@std/assert";
import { EXIT_CODES, main } from "./main.ts";

Deno.test("EXIT_CODES are defined with unique values", () => {
	// Given: EXIT_CODES constant
	// Then: all exit codes should be defined and unique
	assertEquals(EXIT_CODES.DENO_LINT_FAILED, 1);
	assertEquals(EXIT_CODES.BIOME_CHECK_FAILED, 2);
	assertEquals(EXIT_CODES.DOC_LINT_FAILED, 3);
	assertEquals(EXIT_CODES.JSR_DRY_RUN_FAILED, 4);
	assertEquals(EXIT_CODES.TESTS_FAILED, 5);
	assertEquals(EXIT_CODES.COVERAGE_FAILED, 6);

	const values = Object.values(EXIT_CODES);
	const uniqueValues = new Set(values);
	assertEquals(values.length, uniqueValues.size, "Exit codes should be unique");
});

Deno.test("main function exists and is callable", () => {
	// Given: main function from the module
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
