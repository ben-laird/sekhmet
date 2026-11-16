import { assertEquals } from "@std/assert";
import { compareFindings, type Finding, formatFinding } from "./finding.ts";

const finding: Finding = {
	check: "imports",
	file: "packages/a/mod.ts",
	line: 3,
	message: 'package source imports "npm:x"',
};

Deno.test("formatFinding renders text as file:line: error[check]: message", () => {
	// Given: a finding with a line
	// When: formatting it as text
	const line = formatFinding({ finding, format: "text" });

	// Then: it reads like a compiler diagnostic
	assertEquals(
		line,
		'packages/a/mod.ts:3: error[imports]: package source imports "npm:x"',
	);
});

Deno.test("formatFinding renders an allowlisted finding as a warning naming its issue", () => {
	// Given: a finding without a line, allowlisted until #8
	const { line: _, ...noLine } = finding;

	// When: formatting it as text
	const line = formatFinding({
		finding: noLine,
		format: "text",
		allowlistedUntil: "#8",
	});

	// Then: it is a warning on the file, naming the issue
	assertEquals(
		line,
		'packages/a/mod.ts: warning[imports]: package source imports "npm:x" (allowlisted until #8)',
	);
});

Deno.test("formatFinding renders a GitHub Actions annotation with escaped data", () => {
	// Given: a finding whose message has a newline and a percent sign
	const multiline = { ...finding, message: "100%\nsure" };

	// When: formatting it for GitHub
	const line = formatFinding({ finding: multiline, format: "github" });

	// Then: it is a single workflow command on the file and line
	assertEquals(
		line,
		"::error file=packages/a/mod.ts,line=3,title=imports::100%25%0Asure",
	);
});

Deno.test("compareFindings orders by file, then line", () => {
	// Given: findings out of order
	const findings: Finding[] = [
		{ ...finding, file: "b.ts", line: 1 },
		{ ...finding, file: "a.ts", line: 9 },
		{ ...finding, file: "a.ts", line: 2 },
	];

	// When: sorting them
	const sorted = findings.toSorted(compareFindings);

	// Then: they are grouped by file and ordered by line
	assertEquals(
		sorted.map(({ file, line }) => `${file}:${line}`),
		["a.ts:2", "a.ts:9", "b.ts:1"],
	);
});
