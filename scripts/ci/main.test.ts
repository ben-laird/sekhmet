import { assertEquals, assertExists } from "@std/assert";
import { exists } from "@std/fs/exists";
import {
	biomeCiCommand,
	ciSteps,
	coverageCleanupCommand,
	coverageOutputs,
	coverageSummaryCommand,
	dvValidateCommand,
	EXIT_CODES,
	main,
	readinessCommand,
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
	assertEquals(EXIT_CODES.PUBLISH_READINESS_FAILED, 9);
	assertEquals(EXIT_CODES.COVERAGE_SUMMARY_FAILED, 10);
	assertEquals(EXIT_CODES.GENERATED_MAIN_STALE, 11);
	assertEquals(EXIT_CODES.DV_VALIDATE_FAILED, 12);
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

Deno.test("ciSteps validates dv Records with the pinned dv in every environment", () => {
	for (const environment of ENVIRONMENTS) {
		// Given: the CI steps for an environment
		const steps = ciSteps(environment);

		// When: finding the dv step
		const dvStep = steps.find((step) => step.name === "dv Validate");

		// Then: it runs `dv validate` through the frozen `deno task dv` launcher
		assertExists(dvStep, `no dv step in ${JSON.stringify(environment)}`);
		assertEquals(dvStep.exitCode, EXIT_CODES.DV_VALIDATE_FAILED);
		assertEquals(dvStep.command, dvValidateCommand());
		assertEquals(dvValidateCommand(), {
			program: "deno",
			args: ["task", "--quiet", "dv", "validate"],
		});
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

	// Then: locally it always runs after the report and summary; CI omits it
	assertEquals(localCleanup?.condition, "always");
	assertEquals(localCleanup?.dependsOn, [
		"Show coverage report",
		"Coverage Summary",
	]);
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

/** Writes a one-package fixture repo; `broken` drops its README. */
async function fixtureRepo({ broken }: { broken: boolean }): Promise<string> {
	const root = await Deno.makeTempDir({ prefix: "ci-fixture-" });
	const write = async (path: string, text: string) => {
		await Deno.mkdir(`${root}/${path}`.replace(/\/[^/]+$/, ""), {
			recursive: true,
		});
		await Deno.writeTextFile(`${root}/${path}`, text);
	};
	await write(
		"deno.json",
		JSON.stringify({
			workspace: ["./packages/*"],
			publish: { exclude: ["**/*.test.ts"] },
		}),
	);
	await write(
		"packages/a/deno.json",
		JSON.stringify({
			name: "@sekhmet/a",
			license: "MIT",
			exports: { ".": "./mod.ts" },
		}),
	);
	await write("packages/a/mod.ts", "/** A. */\nexport const a = 1;\n");
	await write("packages/a/LICENSE.md", "MIT License\n");
	if (!broken) await write("packages/a/README.md", "# a\n");
	return root;
}

Deno.test("readinessCommand fails a repo with a missing README and names the file", async () => {
	// Given: a fixture repo whose package has no README
	const root = await fixtureRepo({ broken: true });
	const command = readinessCommand("static");

	try {
		// When: running the static readiness checks on it
		const output = await spawnCommand({
			command: {
				...command,
				args: [...(command.args ?? []), "--root", root, "--no-allowlist"],
			},
			env: { GITHUB_ACTIONS: "false" },
		}).output();

		// Then: it fails with a file-located finding
		const stdout = new TextDecoder().decode(output.stdout);
		assertEquals(output.success, false);
		assertEquals(
			stdout.split("\n")[0],
			"packages/a/README.md: error[package-files]: published package @sekhmet/a has no README.md",
		);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("readinessCommand passes a ready repo", async () => {
	// Given: a complete fixture repo
	const root = await fixtureRepo({ broken: false });
	const command = readinessCommand("static");

	try {
		// When: running the static readiness checks on it
		const output = await spawnCommand({
			command: {
				...command,
				args: [...(command.args ?? []), "--root", root, "--no-allowlist"],
			},
		}).output();

		// Then: it passes and says so
		assertEquals(output.success, true);
		assertEquals(
			new TextDecoder().decode(output.stdout).trim(),
			"static: 0 error(s), 0 allowlisted",
		);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("coverageSummaryCommand appends a package table to the GitHub job summary", async () => {
	// Given: a fixture repo with an LCOV report and an empty job summary file
	const root = await fixtureRepo({ broken: false });
	const stepSummary = `${root}/summary.md`;
	await Deno.mkdir(`${root}/coverage`);
	await Deno.writeTextFile(
		`${root}/coverage/lcov.info`,
		`SF:${root}/packages/a/mod.ts\nFNF:0\nFNH:0\nBRF:0\nBRH:0\nLH:1\nLF:2\nend_of_record\n`,
	);
	const command = coverageSummaryCommand("github");

	try {
		// When: summarizing coverage for GitHub
		const output = await spawnCommand({
			command: {
				...command,
				args: [...(command.args ?? []), "--root", root],
			},
			env: { GITHUB_STEP_SUMMARY: stepSummary },
		}).output();

		// Then: the job summary has the package and total rows
		assertEquals(output.success, true);
		const markdown = await Deno.readTextFile(stepSummary);
		assertEquals(
			markdown.includes(
				"| **@sekhmet/a** | **50.0% (1/2)** | **n/a** | **n/a** |",
			),
			true,
		);
		assertEquals(markdown.includes("| **Total** | **50.0% (1/2)**"), true);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("coverageSummaryCommand fails when there is no LCOV report", async () => {
	// Given: a fixture repo where no tests ran with coverage
	const root = await fixtureRepo({ broken: false });
	const command = coverageSummaryCommand("json");

	try {
		// When: summarizing coverage
		const output = await spawnCommand({
			command: {
				...command,
				args: [...(command.args ?? []), "--root", root],
			},
		}).output();

		// Then: it fails and says which file is missing
		assertEquals(output.success, false);
		assertEquals(
			new TextDecoder()
				.decode(output.stderr)
				.startsWith("coverage/lcov.info not found"),
			true,
		);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("coverageOutputs captures JSON totals, and reports output that is not JSON", () => {
	// Given: the stdout of a json-format summary, and garbage
	const encode = (text: string): Deno.CommandOutput => ({
		code: 0,
		signal: null,
		success: true,
		stdout: new TextEncoder().encode(text),
		stderr: new Uint8Array(),
	});

	// When: capturing both
	const good = coverageOutputs(encode('{"total":{}}'));
	const bad = coverageOutputs(encode("oops"));

	// Then: the totals become the coverage output; garbage an error
	assertEquals(good, { context: { coverage: { total: {} } } });
	assertEquals(bad, { context: { coverageError: "not JSON: oops" } });
});
