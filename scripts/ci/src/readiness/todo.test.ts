import { assertEquals } from "@std/assert";
import { sourceViews } from "./source.ts";
import {
	checkTodo,
	isTodoCheckedPath,
	isWorkflowSpecifier,
	todoBindings,
	todoCallIndices,
} from "./todo.ts";

function linesOf(text: string): (number | undefined)[] {
	return checkTodo({
		path: "packages/a/src/a.ts",
		text,
		views: sourceViews(text),
	}).map(({ line }) => line);
}

Deno.test("isWorkflowSpecifier matches @sekhmet/workflow and its subpaths only", () => {
	// Given: workflow specifiers in every form, and look-alikes
	const workflow = [
		"@sekhmet/workflow",
		"@sekhmet/workflow/todo",
		"@sekhmet/workflow/todo/todo",
		"jsr:@sekhmet/workflow",
		"jsr:@sekhmet/workflow@0.1.0/todo",
	];
	const others = [
		"@sekhmet/workflows",
		"@sekhmet/panic",
		"./todo.ts",
		"@/src/todo/todo.ts",
	];

	// When: classifying each
	const results = [...workflow, ...others].map(isWorkflowSpecifier);

	// Then: only the workflow specifiers match
	assertEquals(results, [
		...workflow.map(() => true),
		...others.map(() => false),
	]);
});

Deno.test("todoBindings reads named, aliased and namespace imports of todo", () => {
	// Given: every way to import todo, plus imports that do not bind it
	const text = [
		'import { todo } from "@sekhmet/workflow";',
		'import { invariant, todo as later } from "@sekhmet/workflow/todo";',
		'import * as workflow from "jsr:@sekhmet/workflow@0.1.0";',
		'import { type TodoOptions, unimplemented } from "@sekhmet/workflow/todo";',
		'import type { todo as typeOnly } from "@sekhmet/workflow";',
		'import { todo as other } from "./local.ts";',
		'// import { todo as commented } from "@sekhmet/workflow";',
	].join("\n");

	// When: reading the bindings
	const bindings = todoBindings(sourceViews(text));

	// Then: only value imports of workflow's todo bind a name
	assertEquals(bindings, {
		names: ["todo", "later"],
		namespaces: ["workflow"],
	});
});

Deno.test("todoCallIndices finds calls through each binding, not look-alikes", () => {
	// Given: calls through a name, an alias and a namespace, and look-alikes
	// in a string, a comment, a member of another object and a reference
	const text = [
		"t();",
		"ns.todo({ description: 'x' });",
		"ns . todo ();",
		"t?.();",
		'"t()";',
		"// t()",
		"other.t();",
		"const f = t;",
		"ns.invariant(true);",
	].join("\n");
	const views = sourceViews(text);

	// When: finding the calls
	const lines = todoCallIndices({
		views,
		bindings: { names: ["t"], namespaces: ["ns"] },
	}).map((index) => {
		return text.slice(0, index).split("\n").length;
	});

	// Then: only the real calls count
	assertEquals(lines, [1, 2, 3, 4]);
});

Deno.test("checkTodo reports each call of an imported todo on its line", () => {
	// Given: a module importing todo under an alias and calling it twice
	const text = [
		'import { todo as later } from "@sekhmet/workflow/todo";',
		"",
		"export function a(): number {",
		"\treturn later();",
		"}",
		'export const b = (): never => later({ description: "b" });',
	].join("\n");

	// When: checking it
	const lines = linesOf(text);

	// Then: both calls are findings, on their lines
	assertEquals(lines, [4, 6]);
});

Deno.test("checkTodo ignores a todo that is not workflow's", () => {
	// Given: a local todo function, and workflow's other helpers
	const text = [
		'import { invariant, unimplemented } from "@sekhmet/workflow";',
		"function todo(): void {}",
		"todo();",
		"unimplemented();",
		"invariant(true, { expectedBehavior: 'x' });",
	].join("\n");

	// When: checking it
	const lines = linesOf(text);

	// Then: nothing is reported
	assertEquals(lines, []);
});

Deno.test("checkTodo's finding names the check and the way out", () => {
	// Given: one call
	const text = 'import { todo } from "@sekhmet/workflow";\ntodo();';

	// When: checking it
	const findings = checkTodo({
		path: "packages/a/src/a.ts",
		text,
		views: sourceViews(text),
	});

	// Then: it is a `todo` finding pointing at unimplemented()
	assertEquals(findings, [
		{
			check: "todo",
			file: "packages/a/src/a.ts",
			line: 2,
			message:
				"package source calls todo() from @sekhmet/workflow; write the code, or mark a deliberate gap with unimplemented(), before publishing",
		},
	]);
});

Deno.test("isTodoCheckedPath covers non-test source under a package's src/", () => {
	// Given: package source, a test, a top-level module and non-package paths
	const paths = [
		"packages/a/src/a.ts",
		"packages/a/src/deep/b.ts",
		"packages/a/src/a.test.ts",
		"packages/a/mod.ts",
		"packages/a/src/README.md",
		"packages/ab/src/a.ts",
	];

	// When: asking about each for package a
	const covered = paths.map((path) => {
		return isTodoCheckedPath({ path, packageDir: "packages/a" });
	});

	// Then: only the first two are checked
	assertEquals(covered, [true, true, false, false, false, false]);
});
