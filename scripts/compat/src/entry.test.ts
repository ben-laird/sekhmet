import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { locateTestFile, renderSuiteEntry } from "./entry.ts";

const ROOT = join("/", "repo");

Deno.test("locateTestFile() names the package and the repo-relative path", () => {
	// Given: a test file nested inside a package
	const file = join(ROOT, "packages", "enum", "src", "core", "x.test.ts");

	// When: it is located
	const location = locateTestFile({ root: ROOT, file });

	// Then: the package is the directory under packages/ and the path uses '/'
	assertEquals(location, {
		package: "enum",
		path: "packages/enum/src/core/x.test.ts",
	});
});

Deno.test("locateTestFile() panics outside packages/", () => {
	// Given/When/Then: a script test is not a package test file
	assertThrows(
		() =>
			locateTestFile({
				root: ROOT,
				file: join(ROOT, "scripts", "ci", "a.test.ts"),
			}),
		RangeError,
	);
});

Deno.test("renderSuiteEntry() imports runSuite and lazily imports each file", () => {
	// Given: two test files
	const files = [
		{ package: "enum", path: "packages/enum/a.test.ts" },
		{ package: "vow", path: "packages/vow/b.test.ts" },
	];

	// When: the entry is rendered
	const source = renderSuiteEntry({
		suite: join(ROOT, "scripts", "compat", "src", "suite.ts"),
		root: ROOT,
		files,
	});

	// Then: it wires runSuite, installs Deno.test, and loads each file on demand
	assertStringIncludes(
		source,
		'import { runSuite } from "file:///repo/scripts/compat/src/suite.ts";',
	);
	assertStringIncludes(
		source,
		"Object.assign(globalThis, { Deno: { test, noColor: true } });",
	);
	assertStringIncludes(
		source,
		'{ package: "enum", path: "packages/enum/a.test.ts", load: () => import("file:///repo/packages/enum/a.test.ts") },',
	);
	assertStringIncludes(
		source,
		'load: () => import("file:///repo/packages/vow/b.test.ts")',
	);
});
