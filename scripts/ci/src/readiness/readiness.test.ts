import { assertEquals } from "@std/assert";
import { docLintMembers, readWorkspace, staticFindings } from "./readiness.ts";

const ROOT = JSON.stringify({
	workspace: ["./packages/*", "./scripts/*", "./scripts/add/templates/*"],
	publish: { exclude: ["**/*.test.ts"] },
});
const MIT = "MIT License\n";

function cleanRepo(): Map<string, string> {
	return new Map([
		["deno.json", ROOT],
		[
			"packages/a/deno.json",
			JSON.stringify({
				name: "@sekhmet/a",
				license: "MIT",
				exports: { ".": "./mod.ts" },
			}),
		],
		["packages/a/README.md", '```ts\nimport { a } from "@sekhmet/a";\n```'],
		["packages/a/LICENSE.md", MIT],
		[
			"packages/a/mod.ts",
			'/**\n * A.\n *\n * @module\n */\nimport { b } from "@std/assert";\n/** ```ts\n * import { a } from "@sekhmet/a";\n * ``` */\nexport const a = b;',
		],
		[
			"packages/a/mod.test.ts",
			'import { z } from "npm:z";\nDeno.test("a", () => {\n\t// Given: a\n\t// When: b\n\t// Then: c\n});',
		],
		[
			"packages/b/deno.json",
			JSON.stringify({
				name: "@sekhmet/b",
				publish: false,
				exports: "./mod.ts",
			}),
		],
		["packages/b/mod.ts", "export const b = 1;"],
		["scripts/ci/deno.json", JSON.stringify({ name: "@sekhmet/ci" })],
		["scripts/add/templates/lib/deno.json", JSON.stringify({ name: "@x/t" })],
	]);
}

Deno.test("staticFindings passes a ready repo, where tests may import anything", () => {
	// Given: a published package with every file, an unpublished one without
	// README or LICENSE, and a test that imports from npm
	const files = cleanRepo();

	// When: running the static checks
	const findings = staticFindings(files);

	// Then: there is nothing to report
	assertEquals(findings, []);
});

Deno.test("staticFindings checks schema source, not its tests, for module state", () => {
	// Given: the ready repo with a schema package whose source and test both
	// declare a top-level let
	const files = cleanRepo();
	files.set(
		"packages/schema/deno.json",
		JSON.stringify({
			name: "@sekhmet/schema",
			publish: false,
			exports: { ".": "./mod.ts" },
		}),
	);
	files.set("packages/schema/mod.ts", 'export * from "./src/a.ts";');
	files.set("packages/schema/src/a.ts", "let count = 0;\nexport const a = 1;");
	files.set(
		"packages/schema/src/a.test.ts",
		'let seen = 0;\nDeno.test("a", () => {\n\t// Given: a\n\t// When: b\n\t// Then: c\n});',
	);

	// When: running the static checks
	const findings = staticFindings(files);

	// Then: only the source's let is reported
	assertEquals(
		findings.map(({ check, file, line }) => `${check} ${file}:${line}`),
		["module-state packages/schema/src/a.ts:1"],
	);
});

Deno.test("staticFindings reports each kind of failure with its check", () => {
	// Given: the ready repo broken in one way per check
	const files = cleanRepo();
	files.set("deno.json", JSON.stringify({ ...JSON.parse(ROOT), publish: {} }));
	files.delete("packages/a/README.md");
	files.set(
		"packages/a/mod.ts",
		'import { z } from "npm:z";\n/** import { x } from "@sekhmet/a/x"; */\nexport const a = z;',
	);
	files.set("packages/a/other.test.ts", 'Deno.test("bare", () => {});');

	// When: running the static checks
	const findings = staticFindings(files);

	// Then: each failure is reported once, by its check
	assertEquals(findings.map(({ check }) => check).sort(), [
		"given-when-then",
		"imports",
		"module-doc",
		"package-files",
		"publish-exclude",
		"specifiers",
	]);
});

Deno.test("staticFindings asks only published packages for module docs and README examples", () => {
	// Given: the published package's README loses its example and its module
	// doc, and the unpublished package has neither
	const files = cleanRepo();
	files.set("packages/a/README.md", "# a\n\nProse only.");
	files.set("packages/a/mod.ts", "/** A. */\nexport const a = 1;");
	files.set("packages/b/README.md", "# b");

	// When: running the static checks
	const findings = staticFindings(files);

	// Then: only the published package is reported, once per check
	assertEquals(
		findings.map(({ check, file }) => `${check} ${file}`),
		["module-doc packages/a/mod.ts", "readme-examples packages/a/README.md"],
	);
});

Deno.test("staticFindings reports a todo import only in package source", () => {
	// Given: the same todo import in package source, a package's top-level
	// module, a package test, a script and the workflow package itself
	const call = 'import { todo as t } from "@sekhmet/workflow/todo";\nt();';
	const files = cleanRepo();
	files.set("packages/a/src/a.ts", call);
	files.set(
		"packages/a/src/a.test.ts",
		`${call}\nDeno.test("a", () => {\n\t// Given: a\n\t// When: b\n\t// Then: c\n});`,
	);
	files.set("packages/b/mod.ts", `${call}\nexport const b = 1;`);
	files.set("scripts/ci/x.ts", call);
	files.set(
		"packages/workflow/deno.json",
		JSON.stringify({
			name: "@sekhmet/workflow",
			publish: false,
			exports: "./mod.ts",
		}),
	);
	files.set("packages/workflow/mod.ts", 'export * from "./src/todo/mod.ts";');

	// When: running the static checks
	const findings = staticFindings(files);

	// Then: only the other packages' source is reported, at the import
	assertEquals(
		findings.map(({ check, file, line }) => [check, file, line]),
		[
			["todo", "packages/b/mod.ts", 1],
			["todo", "packages/a/src/a.ts", 1],
		],
	);
});

Deno.test("docLintMembers covers packages and scripts but not the add templates", () => {
	// Given: the ready repo's workspace
	const workspace = readWorkspace(cleanRepo());

	// When: choosing the members to doc-lint
	const members = workspace.ok ? docLintMembers(workspace.value) : [];

	// Then: the templates are left out
	assertEquals(
		members.map(({ dir }) => dir),
		["packages/a", "packages/b", "scripts/ci"],
	);
});
