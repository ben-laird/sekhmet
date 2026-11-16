import { assertEquals } from "@std/assert";
import { checkImports, importSpecifiers, isAllowedImport } from "./imports.ts";
import { sourceViews } from "./source.ts";

Deno.test("importSpecifiers finds static, re-export, side-effect and dynamic imports", () => {
	// Given: one of each import form, and an import in a comment
	const text = [
		'import { a } from "./a.ts";',
		'import type {\n\tB,\n} from "@/b.ts";',
		'export * from "@sekhmet/enum/core";',
		'import "jsr:@std/assert";',
		'const c = await import("npm:c");',
		'// import { d } from "npm:d";',
	].join("\n");

	// When: collecting the specifiers
	const specifiers = importSpecifiers(sourceViews(text)).map(
		({ specifier }) => specifier,
	);

	// Then: every code import is found in order, and the comment is not
	assertEquals(specifiers, [
		"./a.ts",
		"@/b.ts",
		"@sekhmet/enum/core",
		"jsr:@std/assert",
		"npm:c",
	]);
});

Deno.test("isAllowedImport allows relative, @/, @sekhmet and @std only", () => {
	// Given: allowed and disallowed specifiers
	const allowed = [
		"./a.ts",
		"../b.ts",
		"@/c.ts",
		"@sekhmet/enum",
		"@std/assert",
		"jsr:@std/path",
	];
	const disallowed = [
		"npm:zod",
		"jsr:@luca/flag",
		"https://deno.land/x/a.ts",
		"node:fs",
		"@~/scripts/x.ts",
		"@actions/core",
	];

	// When: classifying each
	const results = [...allowed, ...disallowed].map(isAllowedImport);

	// Then: only the first group is allowed
	assertEquals(results, [
		...allowed.map(() => true),
		...disallowed.map(() => false),
	]);
});

Deno.test("checkImports reports a disallowed import on its line", () => {
	// Given: a source whose second line imports from npm
	const text = 'import { a } from "./a.ts";\nimport { z } from "npm:zod";\n';

	// When: checking its imports
	const findings = checkImports({
		path: "packages/a/mod.ts",
		text,
		views: sourceViews(text),
	});

	// Then: the npm import is reported at line 2
	assertEquals(
		findings.map(({ file, line, check }) => `${file}:${line} ${check}`),
		["packages/a/mod.ts:2 imports"],
	);
});
