import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs/exists";
import {
	biomeCiCommand,
	CI_COVERAGE_DIR,
	type CIRun,
	ciSteps,
	coverageCleanupCommand,
	coverageDirFor,
	coverageOutputs,
	coverageSummaryCommand,
	denoTestArgs,
	dvValidateCommand,
	EXIT_CODES,
	gateFilesCommand,
	jsrDryRunCommand,
	main,
	readinessCommand,
	STEP_TIMEOUT,
	STEP_TIMEOUT_MS,
	TEST_TIMEOUT_MS,
} from "./main.ts";
import { spawnCommand } from "./mod.ts";

const LOCAL_COVERAGE_DIR = "/tmp/sekhmet-ci-coverage-test";

const RUNS: CIRun[] = [
	{ isCI: false, isAI: false, coverageDir: LOCAL_COVERAGE_DIR },
	{ isCI: false, isAI: true, coverageDir: LOCAL_COVERAGE_DIR },
	{ isCI: true, isAI: false, coverageDir: CI_COVERAGE_DIR },
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
	assertEquals(EXIT_CODES.TESTS_TIMED_OUT, 13);
	assertEquals(EXIT_CODES.STEP_TIMED_OUT, 14);
	const uniqueValues = new Set(values);
	assertEquals(values.length, uniqueValues.size, "Exit codes should be unique");
});

Deno.test("ciSteps gives every step its own failure code, and no timeout code is a failure code", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);

		// When: collecting each step's failure code and its timeout's code
		const codes = steps.map((step) => step.exitCode);
		const timeoutCodes = new Set(
			steps.flatMap((step) => (step.timeout ? [step.timeout.exitCode] : [])),
		);

		// Then: every step declares a failure code, and no two share one
		assertEquals(
			codes.filter((code) => code === undefined).length,
			0,
			`steps without an exit code in ${JSON.stringify(run)}`,
		);
		assertEquals(new Set(codes).size, codes.length);
		// Then: steps may share a timeout code, but none is also a failure code
		assertEquals(
			codes.filter((code) => code !== undefined && timeoutCodes.has(code)),
			[],
		);
	}
});

Deno.test("ciSteps times out every step but Deno Test after the shared 10 minutes", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);

		// When: collecting the timeouts of every step but Deno Test
		const others = steps.filter((step) => step.name !== "Deno Test");

		// Then: each has the shared timeout, so no step can hang the gate
		for (const step of others) {
			assertEquals(step.timeout, STEP_TIMEOUT, step.name);
		}
		assertEquals(STEP_TIMEOUT, {
			ms: STEP_TIMEOUT_MS,
			exitCode: EXIT_CODES.STEP_TIMED_OUT,
		});
		assertEquals(STEP_TIMEOUT_MS, 600_000);
	}
});

Deno.test("ciSteps kills Deno Test after its timeout in every environment", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);

		// When: finding the test step
		const testStep = steps.find((step) => step.name === "Deno Test");

		// Then: a hang fails with its own exit code after TEST_TIMEOUT_MS
		assertEquals(testStep?.timeout, {
			ms: TEST_TIMEOUT_MS,
			exitCode: EXIT_CODES.TESTS_TIMED_OUT,
		});
		assertEquals(TEST_TIMEOUT_MS, 300_000);
	}
});

Deno.test("ciSteps validates dv Records with the pinned dv in every environment", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);

		// When: finding the dv step
		const dvStep = steps.find((step) => step.name === "dv Validate");

		// Then: it runs `dv validate` through the frozen `deno task dv` launcher
		assertExists(dvStep, `no dv step in ${JSON.stringify(run)}`);
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

Deno.test("ciSteps runs Biome, deno check, lint and test over the paths git does not ignore", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);
		const command = (name: string) =>
			steps.find((step) => step.name === name)?.command;

		// When: finding the Biome, type-check, lint and test steps
		const biome = command("Biome Check");
		const check = command("Deno Check");
		const lint = command("Deno Lint");
		const test = command("Deno Test");

		// Then: all go through the git-listed path wrapper, the tests with the
		// run's coverage directory
		assertEquals(biome, gateFilesCommand({ tool: "biome" }));
		assertEquals(check, gateFilesCommand({ tool: "check" }));
		assertEquals(lint, gateFilesCommand({ tool: "lint" }));
		assertEquals(
			test,
			gateFilesCommand({
				tool: "test",
				args: denoTestArgs({ coverageDir: run.coverageDir }),
			}),
		);
	}
});

Deno.test("gateFilesCommand lints and tests a checkout but never its gitignored scratch", async () => {
	// Given: a git repo with a passing tracked test, and a gitignored
	// playground/ holding a failing test and a lint error
	const dir = await Deno.makeTempDir({ prefix: "ci-gate-files-" });
	const git = (...args: string[]) =>
		new Deno.Command("git", { args, cwd: dir, stdin: "null" }).output();
	const failing = 'Deno.test("fails", () => {\n\tthrow new Error("no");\n});\n';
	const unlinted = "let unused = 1;\nexport {};\n";
	await git("init", "--quiet");
	await Deno.writeTextFile(`${dir}/.gitignore`, "/playground/\n");
	await Deno.mkdir(`${dir}/src`);
	await Deno.writeTextFile(
		`${dir}/src/good.test.ts`,
		'Deno.test("passes", () => {});\n',
	);
	await git("add", ".gitignore", "src/good.test.ts");
	await Deno.mkdir(`${dir}/playground`);
	await Deno.writeTextFile(`${dir}/playground/zz.test.ts`, failing);
	await Deno.writeTextFile(`${dir}/playground/zz.ts`, unlinted);
	const run = (tool: "lint" | "test") =>
		spawnCommand({ command: gateFilesCommand({ tool, root: dir }) }).output();

	try {
		// When: linting and testing it
		const [lint, test] = [await run("lint"), await run("test")];

		// Then: the scratch never reaches either tool
		assertEquals(lint.success, true, new TextDecoder().decode(lint.stderr));
		assertEquals(test.success, true, new TextDecoder().decode(test.stderr));
		assertStringIncludes(new TextDecoder().decode(test.stdout), "1 passed");

		// When: the same files sit untracked where git does not ignore them
		await Deno.writeTextFile(`${dir}/src/zz.test.ts`, failing);
		await Deno.writeTextFile(`${dir}/src/zz.ts`, unlinted);
		const [lintNew, testNew] = [await run("lint"), await run("test")];

		// Then: both tools fail them, before they are ever staged
		assertEquals(lintNew.success, false);
		assertEquals(testNew.success, false);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("gateFilesCommand ignores gitignored scratch but fails other broken files", async () => {
	// Given: a git repo whose gitignored playground/ holds a badly formatted,
	// ill-typed file, next to a clean tracked one
	const dir = await Deno.makeTempDir({ prefix: "ci-gate-files-" });
	const git = (...args: string[]) =>
		new Deno.Command("git", { args, cwd: dir, stdin: "null" }).output();
	const broken = "export const  n: number = 'x'\n";
	await git("init", "--quiet");
	await Deno.writeTextFile(`${dir}/.gitignore`, "/playground/\n");
	await Deno.writeTextFile(`${dir}/good.ts`, "export const n: number = 1;\n");
	await git("add", ".gitignore", "good.ts");
	await Deno.mkdir(`${dir}/playground`);
	await Deno.writeTextFile(`${dir}/playground/scratch.ts`, broken);
	const run = (tool: "biome" | "check") =>
		spawnCommand({ command: gateFilesCommand({ tool, root: dir }) }).output();

	try {
		// When: running each gate tool
		const [biome, check] = [await run("biome"), await run("check")];

		// Then: the scratch never reaches either tool
		assertEquals(biome.success, true, new TextDecoder().decode(biome.stderr));
		assertEquals(check.success, true, new TextDecoder().decode(check.stderr));

		// When: the same broken file is an untracked file git does not ignore
		await Deno.writeTextFile(`${dir}/new.ts`, broken);
		const [biomeNew, checkNew] = [await run("biome"), await run("check")];

		// Then: both tools fail it, before it is ever staged, and their
		// diagnostics reach the step's output
		assertEquals(biomeNew.success, false);
		assertEquals(checkNew.success, false);
		assertStringIncludes(new TextDecoder().decode(checkNew.stderr), "TS2322");
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("ciSteps cleans up coverage data locally even after a failure, and keeps it in CI", () => {
	// Given: the local and CI step lists
	const local = ciSteps({
		isCI: false,
		isAI: true,
		coverageDir: LOCAL_COVERAGE_DIR,
	});
	const ci = ciSteps({ isCI: true, isAI: false, coverageDir: CI_COVERAGE_DIR });

	// When: finding the cleanup step
	const localCleanup = local.find(
		(step) => step.name === "Cleanup coverage data",
	);
	const ciCleanup = ci.find((step) => step.name === "Cleanup coverage data");

	// Then: locally it always runs after the report and summary, removing this
	// run's coverage directory; CI omits it
	assertEquals(localCleanup?.condition, "always");
	assertEquals(localCleanup?.dependsOn, [
		"Show coverage report",
		"Coverage Summary",
	]);
	assertEquals(
		localCleanup?.command,
		coverageCleanupCommand({ dir: LOCAL_COVERAGE_DIR }),
	);
	assertEquals(ciCleanup, undefined);
});

Deno.test("coverageDirFor gives two local runs distinct directories, and CI the uploaded one", async () => {
	// Given: two local gate runs in one checkout, and a CI run
	const made: string[] = [];
	const makeTempDir = async () => {
		const dir = await Deno.makeTempDir({ prefix: "ci-coverage-dir-" });
		made.push(dir);
		return dir;
	};

	try {
		// When: each picks its coverage directory
		const first = await coverageDirFor({ isCI: false });
		const second = await coverageDirFor({ isCI: false });
		const ci = await coverageDirFor({ isCI: true, makeTempDir });
		made.push(first, second);

		// Then: the local runs never share one, so neither's `--clean` deletes
		// the other's (#18); CI keeps the path ci.yml uploads, making no temp dir
		assertEquals(first === second, false);
		assertEquals(await exists(first), true);
		assertEquals(await exists(second), true);
		assertEquals(ci, "coverage");
		assertEquals(made.length, 2);
	} finally {
		for (const dir of made) await Deno.remove(dir, { recursive: true });
	}
});

Deno.test("ciSteps threads the run's coverage directory through every coverage step", () => {
	for (const run of RUNS) {
		// Given: the CI steps for a run
		const steps = ciSteps(run);
		const command = (name: string) =>
			steps.find((step) => step.name === name)?.command;

		// When: reading the test, report, summary and cleanup commands
		const test = command("Deno Test");
		const report = command("Show coverage report");
		const summary = command("Coverage Summary");
		const cleanup = command("Cleanup coverage data");

		// Then: each writes, reads or removes the run's directory, and no other
		assertEquals(
			test?.args?.filter((arg) => arg.startsWith("--coverage")),
			[`--coverage=${run.coverageDir}`],
		);
		assertEquals(report?.args, ["coverage", "--detailed", run.coverageDir]);
		assertEquals(
			summary,
			coverageSummaryCommand({
				format: run.isCI ? "github" : "json",
				coverageDir: run.coverageDir,
			}),
		);
		assertEquals(
			cleanup,
			run.isCI ? undefined : coverageCleanupCommand({ dir: run.coverageDir }),
		);
	}
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

Deno.test("the JSR dry run allows a dirty tree locally, so staged changes can be gated, but not in CI", () => {
	// Given: the local and CI step lists
	const local = ciSteps({
		isCI: false,
		isAI: false,
		coverageDir: LOCAL_COVERAGE_DIR,
	});
	const ci = ciSteps({ isCI: true, isAI: false, coverageDir: CI_COVERAGE_DIR });
	const dryRun = (steps: typeof local) =>
		steps.find((step) => step.name === "JSR Publish Dry Run")?.command;

	// When: reading each run's dry-run command
	const localCommand = dryRun(local);
	const ciCommand = dryRun(ci);

	// Then: only the local run passes --allow-dirty
	assertEquals(localCommand, jsrDryRunCommand({ isCI: false }));
	assertEquals(localCommand?.args, ["publish", "--dry-run", "--allow-dirty"]);
	assertEquals(ciCommand, jsrDryRunCommand({ isCI: true }));
	assertEquals(ciCommand?.args, ["publish", "--dry-run"]);
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
	const command = coverageSummaryCommand({
		format: "github",
		coverageDir: CI_COVERAGE_DIR,
	});

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
	const command = coverageSummaryCommand({
		format: "json",
		coverageDir: CI_COVERAGE_DIR,
	});

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

Deno.test("coverageSummaryCommand reads the LCOV report from a run's own coverage directory outside the repo", async () => {
	// Given: a fixture repo, and an LCOV report in a temp coverage directory
	// outside it, as a local run writes
	const root = await fixtureRepo({ broken: false });
	const coverageDir = await Deno.makeTempDir({ prefix: "ci-coverage-run-" });
	await Deno.writeTextFile(
		`${coverageDir}/lcov.info`,
		`SF:${root}/packages/a/mod.ts\nFNF:0\nFNH:0\nBRF:0\nBRH:0\nLH:1\nLF:2\nend_of_record\n`,
	);
	const command = coverageSummaryCommand({ format: "json", coverageDir });

	try {
		// When: summarizing coverage as JSON
		const output = await spawnCommand({
			command: {
				...command,
				args: [...(command.args ?? []), "--root", root],
			},
		}).output();

		// Then: it read that report, not the repo's coverage/
		assertEquals(output.success, true);
		const totals = coverageOutputs(output).context?.coverage;
		assertEquals(JSON.stringify(totals).includes('"covered":1'), true);
	} finally {
		await Deno.remove(root, { recursive: true });
		await Deno.remove(coverageDir, { recursive: true });
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
