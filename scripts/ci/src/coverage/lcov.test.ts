import { assertEquals } from "@std/assert";
import { describeLcovError, parseLcov } from "./lcov.ts";

const ROOT = "/repo";

Deno.test("parseLcov reads the summary records of each file, relative to the repo", () => {
	// Given: a Deno-style tracefile with two records
	const text = `SF:/repo/packages/a/mod.ts
FN:1,f
FNDA:2,f
FNF:1
FNH:1
BRF:4
BRH:3
DA:1,1
DA:2,0
LH:1
LF:2
end_of_record
SF:/repo/packages/a/b.ts
FNF:0
FNH:0
BRF:0
BRH:0
LH:5
LF:5
end_of_record
`;

	// When: parsing it
	const parsed = parseLcov({ text, repoRoot: ROOT });

	// Then: each file has its line, branch and function tallies
	assertEquals(parsed, {
		ok: true,
		value: [
			{
				path: "packages/a/mod.ts",
				lines: { covered: 1, total: 2 },
				branches: { covered: 3, total: 4 },
				functions: { covered: 1, total: 1 },
			},
			{
				path: "packages/a/b.ts",
				lines: { covered: 5, total: 5 },
				branches: { covered: 0, total: 0 },
				functions: { covered: 0, total: 0 },
			},
		],
	});
});

Deno.test("parseLcov counts DA, BRDA and FN/FNDA entries when a record has no summary", () => {
	// Given: a record with only detail entries ("-" is a branch never reached)
	const text = `TN:
SF:/elsewhere/x.ts
FN:1,f
FN:5,g
FNDA:1,f
FNDA:0,g
BRDA:2,0,0,1
BRDA:2,0,1,-
DA:1,3
DA:2,0
DA:3,1
end_of_record`;

	// When: parsing it
	const parsed = parseLcov({ text, repoRoot: ROOT });

	// Then: the tallies are counted, and a path outside the repo is kept as is
	assertEquals(parsed, {
		ok: true,
		value: [
			{
				path: "/elsewhere/x.ts",
				lines: { covered: 2, total: 3 },
				branches: { covered: 1, total: 2 },
				functions: { covered: 1, total: 2 },
			},
		],
	});
});

Deno.test("parseLcov returns malformed input as an error value", () => {
	// Given: an entry before any record, a bad count, and an unterminated record
	const inputs = ["DA:1,1", "SF:/repo/a.ts\nLF:many", "SF:/repo/a.ts\nLF:1"];

	// When: parsing each
	const errors = inputs.map((text) => {
		const parsed = parseLcov({ text, repoRoot: ROOT });
		return parsed.ok ? "ok" : describeLcovError(parsed.error);
	});

	// Then: each says what is wrong and where
	assertEquals(errors, [
		'line 1: "DA:1,1" is outside an SF:…end_of_record record',
		'line 2: "LF:many" has a count that is not a non-negative integer',
		"the record for /repo/a.ts has no end_of_record",
	]);
});
