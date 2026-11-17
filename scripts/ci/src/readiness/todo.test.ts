import { assertEquals } from "@std/assert";
import { sourceViews } from "./source.ts";
import {
	checkTodo,
	isTodoCheckedPath,
	todoUses,
	workflowModule,
} from "./todo.ts";

const PATH = "packages/a/src/a.ts";

function usesOf(text: string): [string, number][] {
	return checkTodo({
		path: PATH,
		text,
		views: sourceViews(text),
		packageDir: "packages/a",
	}).map(({ line, message }) => {
		return [message.split(";")[0] ?? "", line ?? 0];
	});
}

Deno.test("workflowModule recognizes every way to name @sekhmet/workflow", () => {
	// Given: specifiers in every form, to modules with and without todo
	const specifiers = [
		"@sekhmet/workflow",
		"@sekhmet/workflow/todo",
		"@sekhmet/workflow/todo/todo",
		"@sekhmet/workflow/invariant",
		"jsr:@sekhmet/workflow@0.1.0/todo",
		"npm:@jsr/sekhmet__workflow@0.1.0",
		"@jsr/sekhmet__workflow/unreachable",
		"https://jsr.io/@sekhmet/workflow/0.1.0/mod.ts",
		"https://jsr.io/@sekhmet/workflow/0.1.0/src/todo/todo.ts",
		"https://jsr.io/@sekhmet/workflow/0.1.0/src/invariant/invariant.ts",
		"../../workflow/src/todo/todo.ts",
		"../../workflow/mod.ts",
		"@sekhmet/workflows",
		"@sekhmet/panic",
		"./todo.ts",
		"@/src/todo/todo.ts",
	];

	// When: classifying each from a file of package a
	const modules = specifiers.map((specifier) => {
		return workflowModule({ specifier, path: PATH, packageDir: "packages/a" });
	});

	// Then: workflow modules are found, and those holding todo say so
	const yes = { holdsTodo: true };
	const no = { holdsTodo: false };
	assertEquals(modules, [
		yes,
		yes,
		yes,
		no,
		yes,
		yes,
		no,
		yes,
		yes,
		no,
		yes,
		yes,
		undefined,
		undefined,
		undefined,
		undefined,
	]);
});

Deno.test("checkTodo flags every import that binds todo", () => {
	// Given: named, aliased, quoted and multi-line imports of todo, and
	// imports that do not bind it
	const text = [
		'import { todo } from "@sekhmet/workflow";',
		'import { invariant, todo as later } from "@sekhmet/workflow/todo";',
		'import { "todo" as quoted } from "jsr:@sekhmet/workflow@0.1.0";',
		"import {",
		"\ttodo as wrapped,",
		'} from "npm:@jsr/sekhmet__workflow";',
		'import { type TodoOptions, unimplemented } from "@sekhmet/workflow/todo";',
		'import type { todo as typeOnly } from "@sekhmet/workflow";',
		'import { todo as other } from "./local.ts";',
		'// import { todo as commented } from "@sekhmet/workflow";',
	].join("\n");

	// When: checking it
	const uses = usesOf(text);

	// Then: each value import of workflow's todo is flagged on its line
	assertEquals(uses, [
		["package source imports todo from @sekhmet/workflow", 1],
		["package source imports todo from @sekhmet/workflow", 2],
		["package source imports todo from @sekhmet/workflow", 3],
		["package source imports todo from @sekhmet/workflow", 4],
	]);
});

Deno.test("checkTodo flags re-exports of todo or of a module holding it", () => {
	// Given: named and star re-exports, from modules with and without todo
	const text = [
		'export { todo } from "@sekhmet/workflow";',
		'export { todo as later } from "@sekhmet/workflow/todo";',
		'export * from "@sekhmet/workflow/todo";',
		'export * as workflow from "@sekhmet/workflow";',
		'export * from "@sekhmet/workflow/invariant";',
		'export { invariant } from "@sekhmet/workflow";',
		'export type { TodoOptions } from "@sekhmet/workflow";',
	].join("\n");

	// When: checking it
	const uses = usesOf(text);

	// Then: the first four are flagged
	assertEquals(
		uses.map(([, line]) => line),
		[1, 2, 3, 4],
	);
	assertEquals(
		uses[0]?.[0],
		"package source re-exports todo from @sekhmet/workflow",
	);
});

Deno.test("checkTodo flags todo reached through a namespace or a dynamic import", () => {
	// Given: a namespace import used in every member form, a namespace of a
	// module without todo, and dynamic imports
	const text = [
		'import * as w from "@sekhmet/workflow";',
		'import * as inv from "@sekhmet/workflow/invariant";',
		"w.invariant(true, { expectedBehavior: 'x' });",
		"w.todo();",
		'w["todo"]();',
		"const f = w?.todo;",
		"inv.invariant(true, { expectedBehavior: 'x' });",
		'const m = await import("@sekhmet/workflow/todo");',
		'const n = await import("@sekhmet/workflow/unreachable");',
	].join("\n");

	// When: checking it
	const uses = usesOf(text);

	// Then: each todo reference and the dynamic import of todo's module count
	assertEquals(uses, [
		["package source uses todo from @sekhmet/workflow through w", 4],
		["package source uses todo from @sekhmet/workflow through w", 5],
		["package source uses todo from @sekhmet/workflow through w", 6],
		[
			"package source dynamically imports todo's module from @sekhmet/workflow",
			8,
		],
	]);
});

Deno.test("checkTodo flags a relative import into the workflow package", () => {
	// Given: a package reaching into the workflow package's source
	const text = 'import { todo } from "../../workflow/src/todo/todo.ts";';

	// When: checking it
	const uses = usesOf(text);

	// Then: it is flagged like the bare specifier
	assertEquals(uses, [
		["package source imports todo from @sekhmet/workflow", 1],
	]);
});

Deno.test("checkTodo ignores a todo that is not workflow's", () => {
	// Given: a local todo, a shadowing parameter, and workflow's other helpers
	const text = [
		'import { invariant, unimplemented } from "@sekhmet/workflow";',
		"function todo(): void {}",
		"todo();",
		"export const run = (todo: () => void): void => todo();",
		"unimplemented();",
		"invariant(true, { expectedBehavior: 'x' });",
	].join("\n");

	// When: checking it
	const uses = usesOf(text);

	// Then: nothing is reported
	assertEquals(uses, []);
});

Deno.test("checkTodo's finding names the check and the way out", () => {
	// Given: one import
	const text = 'import { todo } from "@sekhmet/workflow";\ntodo();';

	// When: checking it
	const findings = checkTodo({
		path: PATH,
		text,
		views: sourceViews(text),
		packageDir: "packages/a",
	});

	// Then: it is a `todo` finding pointing at unimplemented()
	assertEquals(findings, [
		{
			check: "todo",
			file: PATH,
			line: 1,
			message:
				"package source imports todo from @sekhmet/workflow; write the code, or mark a deliberate gap with unimplemented(), before publishing",
		},
	]);
});

Deno.test("todoUses sorts uses by position", () => {
	// Given: a re-export before an import
	const text = [
		'export * from "@sekhmet/workflow";',
		'import { todo } from "@sekhmet/workflow";',
	].join("\n");

	// When: listing the uses
	const kinds = todoUses({
		views: sourceViews(text),
		path: PATH,
		packageDir: "packages/a",
	}).map(({ kind }) => kind);

	// Then: they come in source order
	assertEquals(kinds, ["re-export", "import"]);
});

Deno.test("isTodoCheckedPath covers every non-test module of a package but workflow", () => {
	// Given: package source, a top-level module, a test, non-TypeScript, a
	// look-alike package directory, and the workflow package itself
	const cases: [string, string, string][] = [
		["packages/a/src/a.ts", "packages/a", "@sekhmet/a"],
		["packages/a/mod.ts", "packages/a", "@sekhmet/a"],
		["packages/a/src/a.test.ts", "packages/a", "@sekhmet/a"],
		["packages/a/README.md", "packages/a", "@sekhmet/a"],
		["packages/ab/src/a.ts", "packages/a", "@sekhmet/a"],
		["packages/workflow/mod.ts", "packages/workflow", "@sekhmet/workflow"],
	];

	// When: asking about each
	const covered = cases.map(([path, packageDir, packageName]) => {
		return isTodoCheckedPath({ path, packageDir, packageName });
	});

	// Then: only the first two are checked
	assertEquals(covered, [true, true, false, false, false, false]);
});
