import { assertEquals } from "@std/assert";
import { summarizeCoverage } from "./coverage.ts";
import { formatTally, renderCoverageMarkdown } from "./markdown.ts";

Deno.test("formatTally shows a percentage with counts, or n/a when empty", () => {
	// Given: a partly covered tally and an empty one
	// When: formatting both
	const formatted = [
		formatTally({ covered: 37, total: 40 }),
		formatTally({ covered: 0, total: 0 }),
	];

	// Then: the first has one decimal and its counts
	assertEquals(formatted, ["92.5% (37/40)", "n/a"]);
});

Deno.test("renderCoverageMarkdown groups file rows under bold package rows and ends with a total", () => {
	// Given: a summary of two files in one package
	const summary = summarizeCoverage({
		files: [
			{
				path: "packages/a/src/x.ts",
				lines: { covered: 1, total: 2 },
				branches: { covered: 0, total: 0 },
				functions: { covered: 1, total: 1 },
			},
			{
				path: "packages/a/mod.ts",
				lines: { covered: 2, total: 2 },
				branches: { covered: 1, total: 2 },
				functions: { covered: 0, total: 1 },
			},
		],
		packages: [{ name: "@sekhmet/a", dir: "packages/a" }],
	});

	// When: rendering it
	const markdown = renderCoverageMarkdown(summary);

	// Then: it is one table, files shown relative to their package
	assertEquals(
		markdown,
		`## Coverage

| File | Lines | Branches | Functions |
| :--- | ---: | ---: | ---: |
| **@sekhmet/a** | **75.0% (3/4)** | **50.0% (1/2)** | **50.0% (1/2)** |
| &nbsp;&nbsp;mod.ts | 100.0% (2/2) | 50.0% (1/2) | 0.0% (0/1) |
| &nbsp;&nbsp;src/x.ts | 50.0% (1/2) | n/a | 100.0% (1/1) |
| **Total** | **75.0% (3/4)** | **50.0% (1/2)** | **50.0% (1/2)** |
`,
	);
});
