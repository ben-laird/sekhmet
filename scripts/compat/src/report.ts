/**
 * Reading a {@linkcode SuiteReport} back from a runtime, judging it, and
 * summarizing it per package.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { z } from "zod";
import type {
	FileReport,
	SuiteReport,
	TestReport,
	UncaughtScope,
} from "./protocol.ts";

const outcomeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("passed") }),
	z.object({ kind: z.literal("failed"), error: z.string() }),
	z.object({ kind: z.literal("ignored") }),
]);

const testReportSchema: z.ZodType<TestReport> = z.object({
	name: z.string(),
	outcome: outcomeSchema,
	get steps(): z.ZodArray<z.ZodType<TestReport>> {
		return z.array(testReportSchema);
	},
});

const locationShape = { package: z.string(), path: z.string() };

const uncaughtSchema = z.object({
	scope: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("test"), path: z.string(), test: z.string() }),
		z.object({ kind: z.literal("file"), path: z.string() }),
		z.object({ kind: z.literal("run") }),
	]),
	error: z.string(),
});

const suiteReportSchema: z.ZodType<SuiteReport> = z.object({
	uncaught: z.array(uncaughtSchema),
	files: z.array(
		z.discriminatedUnion("kind", [
			z.object({
				...locationShape,
				kind: z.literal("ran"),
				tests: z.array(testReportSchema),
				usedOnly: z.boolean(),
			}),
			z.object({
				...locationShape,
				kind: z.literal("load-failed"),
				error: z.string(),
			}),
		]),
	),
});

/**
 * Validates a report a runtime sent back.
 *
 * @param data - The parsed JSON
 * @returns The report, or why it is malformed
 */
export function parseSuiteReport(data: unknown): Result<SuiteReport, string> {
	const parsed = suiteReportSchema.safeParse(data);
	return parsed.success
		? Ok(parsed.data)
		: Err(`malformed suite report: ${z.prettifyError(parsed.error)}`);
}

/**
 * Adds the uncaught errors the host saw outside the suite's own watch (a
 * browser's page errors) to a report, scoped to the whole run.
 *
 * @param options.report - The suite report
 * @param options.hostErrors - The errors the host saw, described
 * @returns The report with one uncaught entry per host error
 */
export function withHostErrors({
	report,
	hostErrors,
}: {
	report: SuiteReport;
	hostErrors: readonly string[];
}): SuiteReport {
	return {
		...report,
		uncaught: [
			...report.uncaught,
			...hostErrors.map((error) => ({
				scope: { kind: "run" as const },
				error,
			})),
		],
	};
}

/** Pass/fail counts for one package. */
export interface PackageSummary {
	/** The package directory name under `packages/` */
	package: string;
	/** Test files that loaded and ran */
	files: number;
	/** Test files that threw while loading */
	loadFailures: number;
	/** Tests (top-level registrations) that passed */
	passed: number;
	/** Tests that failed */
	failed: number;
	/** Tests that were ignored */
	ignored: number;
	/** Steps, at any depth, that passed */
	stepsPassed: number;
	/** Steps that failed */
	stepsFailed: number;
}

function emptySummary(name: string): PackageSummary {
	return {
		package: name,
		files: 0,
		loadFailures: 0,
		passed: 0,
		failed: 0,
		ignored: 0,
		stepsPassed: 0,
		stepsFailed: 0,
	};
}

function countSteps({
	steps,
	summary,
}: {
	steps: readonly TestReport[];
	summary: PackageSummary;
}): void {
	for (const step of steps) {
		if (step.outcome.kind === "passed") summary.stepsPassed += 1;
		if (step.outcome.kind === "failed") summary.stepsFailed += 1;
		countSteps({ steps: step.steps, summary });
	}
}

function addFile({
	file,
	summary,
}: {
	file: FileReport;
	summary: PackageSummary;
}): void {
	if (file.kind === "load-failed") {
		summary.loadFailures += 1;
		return;
	}
	summary.files += 1;
	for (const test of file.tests) {
		summary[test.outcome.kind] += 1;
		countSteps({ steps: test.steps, summary });
	}
}

/**
 * Totals a report per package, sorted by package name.
 *
 * @param report - The suite report
 * @returns One summary per package that has test files
 */
export function summarize(report: SuiteReport): PackageSummary[] {
	const byPackage = new Map<string, PackageSummary>();
	for (const file of report.files) {
		const summary = byPackage.get(file.package) ?? emptySummary(file.package);
		byPackage.set(file.package, summary);
		addFile({ file, summary });
	}
	return [...byPackage.values()].sort((a, b) =>
		a.package.localeCompare(b.package),
	);
}

/** Why a suite run is not green. */
export type Problem =
	| { kind: "load-failed"; path: string; error: string }
	| { kind: "test-failed"; path: string; test: string; error: string }
	| { kind: "used-only"; path: string }
	| { kind: "uncaught"; scope: UncaughtScope; error: string }
	| { kind: "no-tests" };

function failuresIn({
	tests,
	path,
	prefix,
}: {
	tests: readonly TestReport[];
	path: string;
	prefix: string;
}): Problem[] {
	return tests.flatMap((test) => {
		const name = `${prefix}${test.name}`;
		const nested = failuresIn({
			tests: test.steps,
			path,
			prefix: `${name} > `,
		});
		return test.outcome.kind === "failed"
			? [
					{ kind: "test-failed", path, test: name, error: test.outcome.error },
					...nested,
				]
			: nested;
	});
}

/**
 * Lists every reason a run is not green: a file that failed to load, a test
 * or step that failed, a file that used `only`, an uncaught error, or a run
 * with no tests.
 *
 * @param report - The suite report
 * @returns The problems, empty when the run is green
 */
export function problemsOf(report: SuiteReport): Problem[] {
	const problems = report.files.flatMap((file): Problem[] => {
		if (file.kind === "load-failed") {
			return [{ kind: "load-failed", path: file.path, error: file.error }];
		}
		const failures = failuresIn({
			tests: file.tests,
			path: file.path,
			prefix: "",
		});
		return file.usedOnly
			? [...failures, { kind: "used-only", path: file.path }]
			: failures;
	});
	const uncaught = report.uncaught.map(
		({ scope, error }): Problem => ({ kind: "uncaught", scope, error }),
	);
	const tests = report.files.reduce(
		(total, file) => total + (file.kind === "ran" ? file.tests.length : 0),
		0,
	);
	return tests === 0
		? [...problems, ...uncaught, { kind: "no-tests" }]
		: [...problems, ...uncaught];
}

function describeScope(scope: UncaughtScope): string {
	switch (scope.kind) {
		case "test":
			return `${scope.path} :: ${scope.test}`;
		case "file":
			return scope.path;
		case "run":
			return "outside any test file";
	}
}

function describeProblem(problem: Problem): string {
	switch (problem.kind) {
		case "load-failed":
			return `LOAD FAILED ${problem.path}\n${problem.error}`;
		case "test-failed":
			return `FAILED ${problem.path} :: ${problem.test}\n${problem.error}`;
		case "used-only":
			return `ONLY ${problem.path} uses \`only\`, which fails the run`;
		case "uncaught":
			return `UNCAUGHT ${describeScope(problem.scope)}\n${problem.error}`;
		case "no-tests":
			return "NO TESTS the suite registered no tests";
	}
}

function row(cells: readonly (string | number)[]): string {
	const [first = "", ...rest] = cells.map(String);
	return [first.padEnd(12), ...rest.map((cell) => cell.padStart(8))].join(" ");
}

/**
 * Renders the per-package table and every problem, for the terminal.
 *
 * @param options.runtime - The runtime the suite ran on
 * @param options.report - The suite report
 * @returns The text to print
 */
export function formatReport({
	runtime,
	report,
}: {
	runtime: string;
	report: SuiteReport;
}): string {
	const summaries = summarize(report);
	const problems = problemsOf(report);
	const table = [
		row([
			"package",
			"files",
			"loadErr",
			"passed",
			"failed",
			"ignored",
			"steps",
			"stepErr",
		]),
		...summaries.map((s) =>
			row([
				s.package,
				s.files,
				s.loadFailures,
				s.passed,
				s.failed,
				s.ignored,
				s.stepsPassed,
				s.stepsFailed,
			]),
		),
	];
	const verdict =
		problems.length === 0
			? `compat:test ${runtime}: PASS`
			: `compat:test ${runtime}: FAIL (${problems.length} problem(s))`;
	return [...problems.map(describeProblem), "", ...table, "", verdict].join(
		"\n",
	);
}
