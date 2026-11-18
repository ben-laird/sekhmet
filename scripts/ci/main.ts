// deno-coverage-ignore-file
import { fromFileUrl } from "@std/path";
import {
	runWorkflow,
	type StepCommand,
	type StepOutputs,
	type StepTimeout,
	type WorkflowStep,
} from "@/mod.ts";
import type { GateTool } from "@/src/gate-files.ts";
import {
	greenMarkerPath,
	hooksPath,
	readGateHooks,
	sharedHooksDir,
	stagedSnapshot,
	writeGreenMarker,
} from "@/src/git.ts";
import { type GreenRunDecision, greenRunDecision } from "@/src/green-run.ts";
import { hooksWarning } from "@/src/hooks.ts";

export type { GateTool };

/**
 * Exit codes for CI workflow failures.
 * Each step has a unique failure code to identify which step failed. A step
 * that outlives its timeout ends with a timeout code instead, which no step
 * uses as its failure code: Deno Test has its own, and every other step shares
 * `STEP_TIMED_OUT`, so the timeout message names the step.
 */
export const EXIT_CODES = {
	/** Exit code when Deno lint fails */
	DENO_LINT_FAILED: 1,
	/** Exit code when Biome check fails */
	BIOME_CHECK_FAILED: 2,
	/** Exit code when documentation lint fails */
	DOC_LINT_FAILED: 3,
	/** Exit code when JSR publish dry run fails */
	JSR_DRY_RUN_FAILED: 4,
	/** Exit code when tests fail */
	TESTS_FAILED: 5,
	/** Exit code when coverage report generation fails */
	COVERAGE_FAILED: 6,
	/** Exit code when Deno type checking fails */
	DENO_CHECK_FAILED: 7,
	/** Exit code when removing local coverage data fails */
	CLEANUP_FAILED: 8,
	/** Exit code when the publish-readiness checks fail */
	PUBLISH_READINESS_FAILED: 9,
	/** Exit code when the coverage summary cannot be built */
	COVERAGE_SUMMARY_FAILED: 10,
	/** Exit code when generated main modules are stale versus their mini source */
	GENERATED_MAIN_STALE: 11,
	/** Exit code when `dv validate` rejects the dv config or a Record */
	DV_VALIDATE_FAILED: 12,
	/** Exit code when tests outlive {@linkcode TEST_TIMEOUT_MS} and are killed */
	TESTS_TIMED_OUT: 13,
	/** Exit code when any step but Deno Test outlives {@linkcode STEP_TIMEOUT_MS} and is killed */
	STEP_TIMED_OUT: 14,
} as const;

/**
 * How long "Deno Test" may run before its process tree is killed: 5 minutes.
 * The whole suite takes 4–13 s locally, so this leaves over 20x headroom for
 * a slow or cold CI runner, yet fails a hang within a sixth of the release
 * job's 30-minute budget instead of eating all of it.
 */
export const TEST_TIMEOUT_MS: number = 5 * 60 * 1000;

/**
 * How long every step but Deno Test may run before its process tree is
 * killed: 10 minutes. Each takes seconds when warm, but lint, check, Biome,
 * dv and the JSR dry run fetch dependencies, so a cold CI runner can stall on
 * the network; this fails such a stall within a third of the release job's
 * 30-minute budget.
 */
export const STEP_TIMEOUT_MS: number = 10 * 60 * 1000;

/** The timeout every step but Deno Test gets (see {@linkcode STEP_TIMEOUT_MS}). */
export const STEP_TIMEOUT: StepTimeout = {
	ms: STEP_TIMEOUT_MS,
	exitCode: EXIT_CODES.STEP_TIMED_OUT,
};

/**
 * The environment the CI workflow adapts to.
 */
export interface CIEnvironment {
	/** Running in a CI service (`CI=true`) */
	isCI: boolean;
	/** Running for an AI agent (`CI_AI=true`) */
	isAI: boolean;
}

/**
 * One run of the CI workflow: its environment, and the coverage directory
 * this run alone writes (see {@linkcode coverageDirFor}).
 */
export interface CIRun extends CIEnvironment {
	/** Where Deno Test writes coverage profiles and the lcov/HTML reports */
	coverageDir: string;
}

/**
 * Where CI keeps coverage: the path `.github/workflows/ci.yml` uploads as the
 * `coverage-html` artifact (`coverage/html`, `coverage/lcov.info`).
 */
export const CI_COVERAGE_DIR = "coverage";

/**
 * The coverage directory for one run. `deno test --clean` deletes its
 * coverage directory, so two gates sharing one in a checkout break each other
 * (#18). A local run gets a fresh temp directory of its own, which its cleanup
 * step removes. In CI it is {@linkcode CI_COVERAGE_DIR}: each job runs one
 * gate in a fresh checkout, and the artifact upload needs a stable path.
 *
 * @param options.isCI - Running in a CI service
 * @param options.makeTempDir - Creates a unique temp directory (default: `Deno.makeTempDir`)
 * @returns The directory path
 */
export async function coverageDirFor({
	isCI,
	makeTempDir = () => Deno.makeTempDir({ prefix: "sekhmet-ci-coverage-" }),
}: {
	isCI: boolean;
	makeTempDir?: () => Promise<string>;
}): Promise<string> {
	return isCI ? CI_COVERAGE_DIR : await makeTempDir();
}

/**
 * The Biome CI check, over the whole project or the given paths.
 *
 * The npm launcher needs `--allow-env` (reads `BIOME_BINARY`) and
 * `--allow-run` (spawns the native binary). Without `--allow-run` it prints
 * nothing and exits 0, so the check silently passes.
 *
 * @param options.paths - Files or directories to check (default: the project)
 * @returns The command to run
 */
export function biomeCiCommand({
	paths = [],
}: {
	paths?: string[];
} = {}): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-env",
			"--allow-run",
			"@biomejs/biome",
			"ci",
			...paths,
		],
	};
}

/**
 * A gate tool run over the paths git does not ignore (see `gate-files.ts`),
 * so gitignored scratch in `playground/` never fails the gate while the
 * editor and a hand-run `deno lint` or `deno test` still cover it.
 *
 * @param options.tool - `biome` for `biome ci`, or `check`, `lint` or `test`
 *   for that `deno` subcommand
 * @param options.root - The git checkout to list (default: the working directory)
 * @param options.args - Arguments for the tool, passed before the paths
 * @returns The command to run
 */
export function gateFilesCommand({
	tool,
	root,
	args = [],
}: {
	tool: GateTool;
	root?: string;
	args?: string[];
}): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-env",
			"--allow-run=git,deno",
			fromFileUrl(new URL("./gate-files.ts", import.meta.url)),
			tool,
			...(root === undefined ? [] : ["--root", root]),
			...(args.length === 0 ? [] : ["--", ...args]),
		],
	};
}

/**
 * The arguments Deno Test hands `deno test`, before the paths that
 * {@linkcode gateFilesCommand} adds.
 *
 * @param options.coverageDir - Where to write coverage profiles and reports
 * @returns The arguments
 */
export function denoTestArgs({
	coverageDir,
}: {
	coverageDir: string;
}): string[] {
	return [
		// Also type-checks and runs the code blocks in JSDoc and in every
		// markdown file (READMEs, docs/), unless fenced as `ignore`
		"--doc",
		"--parallel",
		"--no-prompt",
		"--allow-env",
		"--allow-read",
		"--allow-write",
		"--allow-run",
		`--coverage=${coverageDir}`,
		// Drop profiles left by an earlier run whose cleanup did not run
		"--clean",
	];
}

/**
 * A publish-readiness run (see `readiness.ts`):
 * - `doc-lint`: `deno doc --lint` per workspace member over its export set,
 *   which is what JSR documents
 * - `static`: README/LICENSE, exports, entrypoint module docs, imports,
 *   `publish.exclude`, Given/When/Then, README/JSDoc specifier, module
 *   state and `todo` checks
 *
 * Known failures are allowlisted in `src/readiness/allowlisted.ts`.
 *
 * @param mode - Which checks to run
 * @returns The command to run
 */
export function readinessCommand(mode: "doc-lint" | "static"): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-read",
			"--allow-env",
			"--allow-run=deno",
			fromFileUrl(new URL("./readiness.ts", import.meta.url)),
			mode,
		],
	};
}

/**
 * `dv validate` over `.dv/` (config and Records), through `deno task dv`:
 * the same pinned, `--frozen` dv the release workflow runs, so the step
 * never depends on a `dv` binary being installed.
 *
 * @returns The command to run
 */
export function dvValidateCommand(): StepCommand {
	return { program: "deno", args: ["task", "--quiet", "dv", "validate"] };
}

/**
 * The JSR publish dry run. A local run allows a dirty tree: the commit gate
 * runs it on staged, uncommitted changes, which a clean-tree dry run always
 * refuses. CI checks out a clean commit, so it keeps the clean-tree check.
 *
 * @param options.isCI - Running in a CI service
 * @returns The command to run
 */
export function jsrDryRunCommand({ isCI }: { isCI: boolean }): StepCommand {
	return {
		program: "deno",
		args: ["publish", "--dry-run", ...(isCI ? [] : ["--allow-dirty"])],
	};
}

/**
 * The CI workflow's steps for a run:
 * - Parallel linting (Deno lint, Biome check, per-package documentation lint,
 *   publish readiness, generated-main freshness, `dv validate`, JSR dry run)
 * - Type checking
 * - Testing with coverage
 * - Coverage reporting
 * - Local cleanup of coverage data
 *
 * Every step has its own entry in {@linkcode EXIT_CODES}, and a timeout:
 * Deno Test its own, every other step {@linkcode STEP_TIMEOUT}. Every
 * coverage step uses the run's `coverageDir`.
 */
export function ciSteps({ isCI, isAI, coverageDir }: CIRun): WorkflowStep[] {
	const steps: WorkflowStep[] = [
		// Parallel linting (no dependencies, will run concurrently)
		{
			name: "Deno Lint",
			exitCode: EXIT_CODES.DENO_LINT_FAILED,

			command: gateFilesCommand({ tool: "lint" }),
		},
		{
			name: "Deno Check",
			exitCode: EXIT_CODES.DENO_CHECK_FAILED,

			command: gateFilesCommand({ tool: "check" }),
		},
		{
			name: "Biome Check",
			exitCode: EXIT_CODES.BIOME_CHECK_FAILED,

			command: gateFilesCommand({ tool: "biome" }),
		},
		{
			name: "Documentation Lint",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.DOC_LINT_FAILED,

			command: readinessCommand("doc-lint"),
		},
		{
			name: "Publish Readiness",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.PUBLISH_READINESS_FAILED,

			command: readinessCommand("static"),
		},
		{
			name: "Generated Main Freshness",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.GENERATED_MAIN_STALE,

			command: { program: "deno", args: ["task", "gen:main", "--check"] },
		},
		{
			name: "dv Validate",
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.DV_VALIDATE_FAILED,

			command: dvValidateCommand(),
		},
		{
			name: "JSR Publish Dry Run",
			exitCode: EXIT_CODES.JSR_DRY_RUN_FAILED,

			command: jsrDryRunCommand({ isCI }),
		},

		// Run tests (blocked if lint fails)
		{
			name: "Deno Test",
			dependsOn: ["Deno Lint"],
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.TESTS_FAILED,
			timeout: { ms: TEST_TIMEOUT_MS, exitCode: EXIT_CODES.TESTS_TIMED_OUT },

			command: gateFilesCommand({
				tool: "test",
				args: denoTestArgs({ coverageDir }),
			}),
		},

		// Show coverage report (blocked if tests failed)
		{
			name: "Show coverage report",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: true,
			exitCode: EXIT_CODES.COVERAGE_FAILED,

			command: {
				program: "deno",
				args: ["coverage", "--detailed", coverageDir],
			},
		},

		// Coverage table on the GitHub job summary, or totals in the AI JSON;
		// reads the lcov.info that Deno Test wrote to the coverage directory
		{
			name: "Coverage Summary",
			dependsOn: ["Deno Test"],
			condition: () => isCI || isAI,
			showOutput: (status) => isCI || status === "failed",
			exitCode: EXIT_CODES.COVERAGE_SUMMARY_FAILED,

			command: coverageSummaryCommand({
				format: isCI ? "github" : "json",
				coverageDir,
			}),
			...(isCI ? {} : { captureOutputs: coverageOutputs }),
		},

		// Local cleanup (runs even if tests failed); CI keeps the coverage data
		...(isCI ? [] : [cleanupStep(coverageDir)]),
	];
	return steps.map((step) => ({ timeout: STEP_TIMEOUT, ...step }));
}

/**
 * The coverage summary over `<coverageDir>/lcov.info` (see
 * `coverage-summary.ts`): `github` appends a markdown table to the job
 * summary, `json` prints the totals for {@linkcode coverageOutputs}.
 *
 * @param options.format - Where the summary goes
 * @param options.coverageDir - The coverage directory Deno Test wrote
 * @returns The command to run
 */
export function coverageSummaryCommand({
	format,
	coverageDir,
}: {
	format: "github" | "json";
	coverageDir: string;
}): StepCommand {
	return {
		program: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-read",
			"--allow-write",
			"--allow-env",
			fromFileUrl(new URL("./coverage-summary.ts", import.meta.url)),
			format,
			"--coverage-dir",
			coverageDir,
		],
	};
}

/**
 * Captures the JSON totals that `coverage-summary.ts json` prints as the
 * step's `coverage` output, which the AI JSON carries. Output that is not
 * JSON is captured as `coverageError` instead.
 *
 * @param output - The coverage summary command's output
 * @returns The step outputs
 */
export function coverageOutputs(output: Deno.CommandOutput): StepOutputs {
	const stdout = new TextDecoder().decode(output.stdout);
	try {
		return { context: { coverage: JSON.parse(stdout) } };
	} catch {
		return { context: { coverageError: `not JSON: ${stdout.slice(0, 200)}` } };
	}
}

function cleanupStep(coverageDir: string): WorkflowStep {
	return {
		name: "Cleanup coverage data",
		dependsOn: ["Show coverage report", "Coverage Summary"],
		continueOnError: true,
		condition: "always",
		exitCode: EXIT_CODES.CLEANUP_FAILED,

		command: coverageCleanupCommand({ dir: coverageDir }),
	};
}

/**
 * Removes the coverage directory: the profiles and the lcov/HTML reports
 * that `deno test --coverage` writes. Succeeds when the directory is absent,
 * as when a lint failure blocked the tests.
 *
 * @param options.dir - The coverage directory
 * @returns The command to run
 */
export function coverageCleanupCommand({ dir }: { dir: string }): StepCommand {
	return { program: "rm", args: ["-rf", dir] };
}

/**
 * Main entry point for the CI workflow. Reads the environment, picks this
 * run's coverage directory, runs {@linkcode ciSteps}, records a green run
 * for the staged tree when the run earns one (see `src/green-run.ts`) and
 * exits with the workflow's exit code.
 */
export async function main(): Promise<void> {
	const isCI = Deno.env.get("CI") === "true";
	const warning = isCI ? undefined : await gateWarning();
	if (warning !== undefined) console.error(warning);
	const before = await stagedSnapshot();
	const result = await runWorkflow(
		ciSteps({
			isCI,
			isAI: Deno.env.get("CI_AI") === "true",
			coverageDir: await coverageDirFor({ isCI }),
		}),
	);
	const after = await stagedSnapshot();
	console.error(
		await recordGreenRun(
			greenRunDecision({ steps: result.steps, before, after }),
		),
	);
	Deno.exit(result.exitCode);
}

/** The "commits are not gated" warning for this clone, if it applies. */
async function gateWarning(): Promise<string | undefined> {
	const dir = await sharedHooksDir();
	if (!dir.ok)
		return `warning: cannot tell whether commits are gated: ${dir.error}`;
	const hooks = await readGateHooks(dir.value);
	if (!hooks.ok) {
		return `warning: cannot tell whether commits are gated: ${hooks.error}`;
	}
	return hooksWarning({ hooksPath: await hooksPath(), hooks: hooks.value });
}

/**
 * Carries out a {@linkcode GreenRunDecision}: writes the green marker that
 * the commit gate's `pre-commit` hook reads, or leaves it alone.
 *
 * @param decision - Whether to record the run
 * @returns The one line to print about it
 */
async function recordGreenRun(decision: GreenRunDecision): Promise<string> {
	if (decision.kind === "skip") {
		return `No green run recorded: ${decision.reason}.`;
	}
	const path = await greenMarkerPath();
	const written = path.ok
		? await writeGreenMarker({ path: path.value, tree: decision.tree })
		: path;
	return written.ok
		? `Recorded a green run for staged tree ${decision.tree}.`
		: `No green run recorded: ${written.error}.`;
}

if (import.meta.main) {
	await main();
}
