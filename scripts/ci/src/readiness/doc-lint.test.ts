import { assertEquals } from "@std/assert";
import { docLintArgs, parseDocLint } from "./doc-lint.ts";
import type { Member } from "./workspace.ts";

const VOW: Member = {
	dir: "packages/vow",
	manifestPath: "packages/vow/deno.json",
	manifestText: '{\n\t"name": "@sekhmet/vow",\n\t"exports": {}\n}',
	manifest: {
		name: "@sekhmet/vow",
		publish: true,
		publishExclude: [],
		exports: { ".": "./mod.ts", "./mini": "./src/mini/mod.ts" },
		workspace: [],
	},
};

Deno.test("docLintArgs lints the package's export set", () => {
	// Given: a package with two exports
	// When: building the doc lint arguments
	const args = docLintArgs(VOW);

	// Then: each export path is an entrypoint
	assertEquals(args, ["doc", "--lint", "./mod.ts", "./src/mini/mod.ts"]);
});

Deno.test("parseDocLint turns diagnostics into findings at repo-relative lines", () => {
	// Given: NO_COLOR output with one diagnostic and the summary line
	const output = `error[private-type-ref]: public type 'Vow' references private type 'Enum'
  --> /repo/packages/vow/src/mini/core.ts:56:1
   |
56 | export class Vow<T> extends Enum<Variants<T>> {

error: Found 1 documentation lint error.
`;

	// When: parsing it
	const findings = parseDocLint({
		member: VOW,
		output,
		success: false,
		repoRoot: "/repo",
	});

	// Then: one finding at the source line, carrying the lint code
	assertEquals(findings, [
		{
			check: "doc-lint",
			file: "packages/vow/src/mini/core.ts",
			line: 56,
			message:
				"private-type-ref: public type 'Vow' references private type 'Enum'",
		},
	]);
});

Deno.test("parseDocLint reports other errors and silent failures on the manifest", () => {
	// Given: a missing-module error, and a failure with no recognisable output
	const missing = 'error: Module not found "file:///repo/packages/vow/mod.ts".';

	// When: parsing each
	const fromError = parseDocLint({
		member: VOW,
		output: missing,
		success: false,
		repoRoot: "/repo",
	});
	const fromSilence = parseDocLint({
		member: VOW,
		output: "panic",
		success: false,
		repoRoot: "/repo",
	});

	// Then: both become findings on the exports line of deno.json
	assertEquals(
		[...fromError, ...fromSilence].map(({ file, line }) => `${file}:${line}`),
		["packages/vow/deno.json:3", "packages/vow/deno.json:3"],
	);
});

Deno.test("parseDocLint reports nothing for a clean run", () => {
	// Given: empty output from a successful run
	// When: parsing it
	const findings = parseDocLint({
		member: VOW,
		output: "",
		success: true,
		repoRoot: "/repo",
	});

	// Then: there are no findings
	assertEquals(findings, []);
});
