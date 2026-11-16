import { assertEquals } from "@std/assert";
import {
	addCoverage,
	type Coverage,
	coverageTotals,
	type FileCoverage,
	NO_COVERAGE,
	percent,
	summarizeCoverage,
} from "./coverage.ts";

function file(path: string, lines: [number, number]): FileCoverage {
	return {
		path,
		lines: { covered: lines[0], total: lines[1] },
		branches: { covered: 1, total: 2 },
		functions: { covered: 0, total: 0 },
	};
}

Deno.test("addCoverage is associative and commutative with NO_COVERAGE as identity", () => {
	// Given: three coverages
	const [a, b, c]: [Coverage, Coverage, Coverage] = [
		file("a", [1, 2]),
		file("b", [3, 4]),
		file("c", [0, 9]),
	];

	// When: summing them in different groupings and orders
	const left = addCoverage(addCoverage(a, b), c);
	const right = addCoverage(a, addCoverage(b, c));
	const swapped = addCoverage(c, addCoverage(b, a));
	const withIdentity = addCoverage(a, NO_COVERAGE);

	// Then: every sum agrees, and the identity changes nothing
	assertEquals(left, right);
	assertEquals(left, swapped);
	assertEquals(withIdentity, addCoverage(NO_COVERAGE, a));
	assertEquals(withIdentity.lines, a.lines);
});

Deno.test("percent is undefined when there is nothing to cover", () => {
	// Given: an empty tally and a partly covered one
	// When: taking their percentages
	const empty = percent({ covered: 0, total: 0 });
	const half = percent({ covered: 1, total: 2 });

	// Then: the empty one has none
	assertEquals([empty, half], [undefined, 50]);
});

Deno.test("summarizeCoverage groups files by their deepest package and sums each", () => {
	// Given: files in two packages, a nested member, and outside any package
	const files = [
		file("packages/b/mod.ts", [1, 2]),
		file("packages/a/src/x.ts", [3, 4]),
		file("packages/a/mod.ts", [1, 1]),
		file("packages/a/nested/n.ts", [0, 5]),
		file("tools/t.ts", [2, 2]),
	];
	const packages = [
		{ name: "@sekhmet/a", dir: "packages/a" },
		{ name: "@sekhmet/b", dir: "packages/b" },
		{ name: "@sekhmet/nested", dir: "packages/a/nested" },
	];

	// When: summarizing
	const summary = summarizeCoverage({ files, packages });

	// Then: packages are sorted by directory, files by path, and totals add up
	assertEquals(
		summary.packages.map(({ name, lines, files }) => [
			name,
			lines,
			files.map(({ path }) => path),
		]),
		[
			["(outside packages)", { covered: 2, total: 2 }, ["tools/t.ts"]],
			[
				"@sekhmet/a",
				{ covered: 4, total: 5 },
				["packages/a/mod.ts", "packages/a/src/x.ts"],
			],
			["@sekhmet/nested", { covered: 0, total: 5 }, ["packages/a/nested/n.ts"]],
			["@sekhmet/b", { covered: 1, total: 2 }, ["packages/b/mod.ts"]],
		],
	);
	assertEquals(summary.lines, { covered: 7, total: 14 });
	assertEquals(summary.branches, { covered: 5, total: 10 });
});

Deno.test("coverageTotals gives overall and package totals with rounded percentages", () => {
	// Given: one package with a third of its lines covered and no functions
	const summary = summarizeCoverage({
		files: [file("packages/a/mod.ts", [1, 3])],
		packages: [{ name: "@sekhmet/a", dir: "packages/a" }],
	});

	// When: taking the totals
	const totals = coverageTotals(summary);

	// Then: percentages have one decimal, and an empty measure has null
	assertEquals(totals.total.lines, { covered: 1, total: 3, percent: 33.3 });
	assertEquals(totals.total.functions.percent, null);
	assertEquals(
		totals.packages.map(({ name }) => name),
		["@sekhmet/a"],
	);
});
