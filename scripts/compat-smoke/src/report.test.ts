import { Err, isErr, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import { REPORT_MARKER, type Report } from "@/probe/probe.ts";
import {
	isPackageName,
	type PackageName,
	type PublishedPackage,
} from "@/src/package.ts";
import { findReport, judge } from "@/src/report.ts";

function name(text: string): PackageName {
	if (!isPackageName(text)) throw new Error(`bad fixture: ${text}`);
	return text;
}

const MATRIX = name("@sekhmet/matrix");
const PACKAGES: PublishedPackage[] = [
	{
		name: MATRIX,
		version: "0.1.0",
		exports: { ".": "./mod.ts", "./mini": "./src/mini/mod.ts" },
	},
];
const INSTALLED = new Map([[MATRIX, "0.1.0"]]);

const PASSING: Report = {
	runtime: "node 26.13.0",
	loads: [
		{ package: MATRIX, specifier: "@sekhmet/matrix", ok: true, exports: 1 },
		{
			package: MATRIX,
			specifier: "@sekhmet/matrix/mini",
			ok: true,
			exports: 1,
		},
	],
	exercises: [{ package: MATRIX, ok: true }],
};

Deno.test("findReport reads the last marked line of the probe's output", async (t) => {
	await t.step("a marked line among other output", () => {
		// Given: output with noise and a report line
		const output = [
			"installing...",
			REPORT_MARKER + JSON.stringify(PASSING),
			"",
		].join("\n");

		// When: the report is found
		const report = findReport(output);

		// Then: it is the parsed report
		assertEquals(report, Ok(PASSING));
	});

	await t.step("no marked line", () => {
		// Given: output without a report

		// When: the report is looked for
		const report = findReport("Segmentation fault\n");

		// Then: it is missing
		assertEquals(report, Err("the probe printed no report"));
	});

	await t.step("a malformed report", () => {
		// Given: a marked line with the wrong shape
		const output = `${REPORT_MARKER}{"runtime":1}`;

		// When: the report is found
		const report = findReport(output);

		// Then: it is rejected
		assert(isErr(report));
		assert(unwrapErr(report).startsWith("the report is malformed"));
	});
});

Deno.test("judge passes a run where everything loaded and ran", () => {
	// Given: a passing report

	// When: it is judged
	const verdict = judge({
		packages: PACKAGES,
		installed: INSTALLED,
		report: PASSING,
	});

	// Then: there are no failures and each path is listed
	assertEquals(verdict.failures, 0);
	assertEquals(verdict.lines, [
		"runtime: node 26.13.0",
		"@sekhmet/matrix@0.1.0",
		"  ok   @sekhmet/matrix (1 exports)",
		"  ok   @sekhmet/matrix/mini (1 exports)",
		"  ok   exercise",
		"PASS: 1 packages, 2 export paths, 1 exercises",
	]);
});

Deno.test("judge fails every kind of problem loudly", async (t) => {
	await t.step("an export path that failed to load", () => {
		// Given: a report where one path threw on import
		const report: Report = {
			...PASSING,
			loads: [
				{ package: MATRIX, specifier: "@sekhmet/matrix", ok: true, exports: 1 },
				{
					package: MATRIX,
					specifier: "@sekhmet/matrix/mini",
					ok: false,
					error: "TypeError: boom",
				},
			],
		};

		// When: it is judged
		const verdict = judge({ packages: PACKAGES, installed: INSTALLED, report });

		// Then: the path is a failure with its error
		assertEquals(verdict.failures, 1);
		assert(
			verdict.lines.includes("  FAIL @sekhmet/matrix/mini: TypeError: boom"),
		);
	});

	await t.step("an export path the probe never imported", () => {
		// Given: a report missing a published path
		const report: Report = { ...PASSING, loads: PASSING.loads.slice(0, 1) };

		// When: it is judged
		const verdict = judge({ packages: PACKAGES, installed: INSTALLED, report });

		// Then: the missing path fails
		assert(
			verdict.lines.includes("  FAIL @sekhmet/matrix/mini: never imported"),
		);
	});

	await t.step("a failed or missing exercise", () => {
		// Given: a failed exercise, and a report with none
		const failed: Report = {
			...PASSING,
			exercises: [{ package: MATRIX, ok: false, error: "Error: wrong" }],
		};
		const missing: Report = { ...PASSING, exercises: [] };

		// When: both are judged
		const verdicts = [failed, missing].map((report) =>
			judge({ packages: PACKAGES, installed: INSTALLED, report }),
		);

		// Then: both fail
		assert(verdicts[0]?.lines.includes("  FAIL exercise: Error: wrong"));
		assert(verdicts[1]?.lines.includes("  FAIL exercise: never run"));
	});

	await t.step("a package installed at another version", () => {
		// Given: npm resolved a different version than the one under test
		const installed = new Map([[MATRIX, "0.1.1"]]);

		// When: the run is judged
		const verdict = judge({ packages: PACKAGES, installed, report: PASSING });

		// Then: the mismatch fails and the summary says FAIL
		assertEquals(verdict.failures, 1);
		assert(
			verdict.lines.includes(
				"  FAIL installed version is 0.1.1, expected 0.1.0",
			),
		);
		assert(verdict.lines.at(-1)?.startsWith("FAIL: 1 failed checks"));
	});
});
