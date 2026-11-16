import { isErr, isOk, unwrap } from "@sekhmet/enum/result/mini";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { SuiteReport } from "./protocol.ts";
import {
	formatReport,
	parseSuiteReport,
	problemsOf,
	summarize,
} from "./report.ts";

const passed = { kind: "passed" } as const;

const mixed: SuiteReport = {
	files: [
		{
			package: "enum",
			path: "packages/enum/a.test.ts",
			kind: "ran",
			usedOnly: false,
			tests: [
				{
					name: "outer",
					outcome: { kind: "failed", error: "1 step(s) failed" },
					steps: [
						{ name: "good", outcome: passed, steps: [] },
						{
							name: "bad",
							outcome: { kind: "failed", error: "AssertionError" },
							steps: [],
						},
					],
				},
				{ name: "fine", outcome: passed, steps: [] },
				{ name: "later", outcome: { kind: "ignored" }, steps: [] },
			],
		},
		{
			package: "effect",
			path: "packages/effect/b.test.ts",
			kind: "load-failed",
			error: "SyntaxError",
		},
		{
			package: "effect",
			path: "packages/effect/c.test.ts",
			kind: "ran",
			usedOnly: true,
			tests: [{ name: "focused", outcome: passed, steps: [] }],
		},
	],
};

Deno.test("summarize() totals tests and steps per package, sorted by name", () => {
	// Given: a report across two packages

	// When: it is summarized
	const summaries = summarize(mixed);

	// Then: each package has its own counts
	assertEquals(summaries, [
		{
			package: "effect",
			files: 1,
			loadFailures: 1,
			passed: 1,
			failed: 0,
			ignored: 0,
			stepsPassed: 0,
			stepsFailed: 0,
		},
		{
			package: "enum",
			files: 1,
			loadFailures: 0,
			passed: 1,
			failed: 1,
			ignored: 1,
			stepsPassed: 1,
			stepsFailed: 1,
		},
	]);
});

Deno.test("problemsOf() lists load failures, failed tests and steps, and only", () => {
	// Given: a report with every kind of problem

	// When: its problems are listed
	const problems = problemsOf(mixed);

	// Then: each appears, with steps named by their path
	assertEquals(problems, [
		{
			kind: "test-failed",
			path: "packages/enum/a.test.ts",
			test: "outer",
			error: "1 step(s) failed",
		},
		{
			kind: "test-failed",
			path: "packages/enum/a.test.ts",
			test: "outer > bad",
			error: "AssertionError",
		},
		{
			kind: "load-failed",
			path: "packages/effect/b.test.ts",
			error: "SyntaxError",
		},
		{ kind: "used-only", path: "packages/effect/c.test.ts" },
	]);
});

Deno.test("problemsOf() flags a run with no tests and passes a clean one", async (t) => {
	await t.step("an empty run is a problem", () => {
		// Given/When: a report with no files
		const problems = problemsOf({ files: [] });

		// Then: it is not green
		assertEquals(problems, [{ kind: "no-tests" }]);
	});

	await t.step("a clean run has no problems", () => {
		// Given/When: a report whose only test passed
		const problems = problemsOf({
			files: [
				{
					package: "a",
					path: "packages/a/x.test.ts",
					kind: "ran",
					usedOnly: false,
					tests: [{ name: "x", outcome: passed, steps: [] }],
				},
			],
		});

		// Then: it is green
		assertEquals(problems, []);
	});
});

Deno.test("formatReport() prints problems, the table and a verdict", () => {
	// Given/When: a failing report is formatted
	const text = formatReport({ runtime: "bun", report: mixed });

	// Then: it names the failures and ends with the verdict
	assertStringIncludes(text, "FAILED packages/enum/a.test.ts :: outer > bad");
	assertStringIncludes(text, "LOAD FAILED packages/effect/b.test.ts");
	assertStringIncludes(text, "package");
	assert(text.endsWith("compat:test bun: FAIL (4 problem(s))"));
});

Deno.test("parseSuiteReport() accepts a well-formed report and rejects anything else", () => {
	// Given: a report round-tripped through JSON, and a malformed one
	const data: unknown = JSON.parse(JSON.stringify(mixed));

	// When: each is parsed
	const good = parseSuiteReport(data);
	const bad = parseSuiteReport({ files: [{ kind: "ran" }] });

	// Then: the first is the report again; the second is an error
	assert(isOk(good));
	assertEquals(unwrap(good), mixed);
	assert(isErr(bad));
});
