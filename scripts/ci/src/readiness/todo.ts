import { dirname, join, normalize } from "@std/path/posix";
import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/** The package that defines `todo`, which the check leaves alone. */
export const WORKFLOW_PACKAGE = "@sekhmet/workflow";

/** Where {@linkcode WORKFLOW_PACKAGE} lives in this repository. */
export const WORKFLOW_DIR = "packages/workflow";

/** The export subpaths of `@sekhmet/workflow` that hold `todo`. */
const TODO_SUBPATHS: ReadonlySet<string> = new Set(["", "todo", "todo/todo"]);

/** The files of `@sekhmet/workflow` that hold `todo`. */
const TODO_FILES: ReadonlySet<string> = new Set([
	"mod.ts",
	"src/todo/mod.ts",
	"src/todo/todo.ts",
]);

/**
 * A module of `@sekhmet/workflow` named by a specifier, and whether it
 * holds `todo` (and so exposes it to a namespace or `export *`).
 */
export interface WorkflowModule {
	/** Whether the module exports `todo` */
	holdsTodo: boolean;
}

/**
 * The `@sekhmet/workflow` module a specifier names, or `undefined` for any
 * other module. It recognizes the bare and `jsr:` specifiers (with a
 * version), `npm:@jsr/sekhmet__workflow`, `https://jsr.io/@sekhmet/workflow/…`
 * URLs, and relative or `@/` paths that resolve into {@linkcode WORKFLOW_DIR}.
 */
export function workflowModule({
	specifier,
	path,
	packageDir,
}: {
	specifier: string;
	path: string;
	packageDir: string;
}): WorkflowModule | undefined {
	const exported =
		/^(?:jsr:)?@sekhmet\/workflow(?:@[^/]*)?(?:\/(.*))?$/.exec(specifier) ??
		/^(?:npm:)?@jsr\/sekhmet__workflow(?:@[^/]*)?(?:\/(.*))?$/.exec(specifier);
	if (exported !== null) {
		const subpath = (exported[1] ?? "").replace(/^\.\/|\/$/g, "");
		return { holdsTodo: TODO_SUBPATHS.has(subpath) };
	}
	const published =
		/^https?:\/\/jsr\.io\/@sekhmet\/workflow\/[^/]+\/(.*)$/.exec(specifier);
	if (published !== null) {
		return { holdsTodo: TODO_FILES.has(published[1] ?? "") };
	}
	const local = localPath({ specifier, path, packageDir });
	if (local?.startsWith(`${WORKFLOW_DIR}/`)) {
		return { holdsTodo: TODO_FILES.has(local.slice(WORKFLOW_DIR.length + 1)) };
	}
	return undefined;
}

/** A relative or `@/` specifier as a repo-relative path. */
function localPath({
	specifier,
	path,
	packageDir,
}: {
	specifier: string;
	path: string;
	packageDir: string;
}): string | undefined {
	if (specifier.startsWith("./") || specifier.startsWith("../")) {
		return normalize(join(dirname(path), specifier));
	}
	if (specifier.startsWith("@/")) {
		return normalize(join(packageDir, specifier.slice(2)));
	}
	return undefined;
}

/** How a module reaches `todo`. */
export type TodoUse =
	| { kind: "import"; index: number }
	| { kind: "re-export"; index: number }
	| { kind: "namespace"; index: number; namespace: string }
	| { kind: "dynamic-import"; index: number };

const STRING = `"[^"\\n]*"|'[^'\\n]*'`;
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

/** `import <clause> from "<specifier>"`, the clause possibly quoting names. */
const IMPORT_FROM = new RegExp(
	`\\bimport\\s+(?!type\\b)((?:[^;"'\`]|${STRING})*?)\\s*\\bfrom\\s*(["'])([^"'\\n]+)\\2`,
	"g",
);

/** `export { … } from "<specifier>"` and `export * [as ns] from "…"`. */
const EXPORT_FROM = new RegExp(
	`\\bexport\\s+(?!type\\b)(\\*(?:\\s*as\\s+${IDENTIFIER})?|\\{(?:[^}"'\`]|${STRING})*\\})\\s*from\\s*(["'])([^"'\\n]+)\\2`,
	"g",
);

/** `import("<specifier>")`, a dynamic import of a literal specifier. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\n]+)\1/g;

const NAMESPACE_IMPORT = new RegExp(`\\*\\s*as\\s+(${IDENTIFIER})`);

/**
 * Every way a module reaches `@sekhmet/workflow`'s `todo`: a value import
 * binding it (`import { todo }`, `{ todo as t }`, `{ "todo" as t }`), a
 * re-export of it or of a module holding it, a dynamic import of a module
 * holding it, and `ns.todo` or `ns["todo"]` through a namespace import.
 * Flagging the import rather than call sites catches every call shape
 * (`f = todo; f()`, `todo.call`, `(0, todo)()`).
 */
export function todoUses({
	views,
	path,
	packageDir,
}: {
	views: SourceViews;
	path: string;
	packageDir: string;
}): TodoUse[] {
	const uses: TodoUse[] = [];
	const moduleOf = (specifier: string): WorkflowModule | undefined => {
		return workflowModule({ specifier, path, packageDir });
	};

	for (const match of views.code.matchAll(IMPORT_FROM)) {
		const [, clause = "", , specifier = ""] = match;
		const module = moduleOf(specifier);
		if (module === undefined) {
			continue;
		}
		if (namesTodo(clause)) {
			uses.push({ kind: "import", index: match.index });
		}
		const namespace = NAMESPACE_IMPORT.exec(clause)?.[1];
		if (namespace !== undefined && module.holdsTodo) {
			uses.push(...namespaceUses({ views, namespace }));
		}
	}
	for (const match of views.code.matchAll(EXPORT_FROM)) {
		const [, clause = "", , specifier = ""] = match;
		const module = moduleOf(specifier);
		const reExportsTodo = clause.startsWith("*")
			? module?.holdsTodo === true
			: module !== undefined && namesTodo(clause);
		if (reExportsTodo) {
			uses.push({ kind: "re-export", index: match.index });
		}
	}
	for (const match of views.code.matchAll(DYNAMIC_IMPORT)) {
		if (moduleOf(match[2] ?? "")?.holdsTodo === true) {
			uses.push({ kind: "dynamic-import", index: match.index });
		}
	}
	return uses.sort((a, b) => a.index - b.index);
}

/** Whether an import or export clause's `{ … }` names `todo`, skipping `type` ones. */
function namesTodo(clause: string): boolean {
	const braces = /\{([\s\S]*)\}/.exec(clause)?.[1];
	if (braces === undefined) {
		return false;
	}
	return braces.split(",").some((part) => {
		return /^(?:todo|"todo"|'todo')(?:\s+as\s+\S+)?$/.test(part.trim());
	});
}

/** `ns.todo`, `ns?.todo` and `ns["todo"]` in code (not comments). */
function namespaceUses({
	views,
	namespace,
}: {
	views: SourceViews;
	namespace: string;
}): TodoUse[] {
	const escaped = namespace.replace(/\$/g, "\\$");
	const reference = new RegExp(
		`(?<![\\w$.])${escaped}\\s*(?:\\?\\.\\s*todo\\b|\\.\\s*todo\\b|(?:\\?\\.)?\\[\\s*(["'])todo\\1\\s*\\])`,
		"g",
	);
	return [...views.code.matchAll(reference)].map((match) => {
		return { kind: "namespace", index: match.index, namespace };
	});
}

/**
 * Whether the `todo` check covers a file: non-test TypeScript anywhere in a
 * package (its `mod.ts` included), except in `@sekhmet/workflow`, which
 * defines `todo`. Tests, the playground and `scripts/` may use `todo`.
 */
export function isTodoCheckedPath({
	path,
	packageDir,
	packageName,
}: {
	path: string;
	packageDir: string;
	packageName: string | undefined;
}): boolean {
	return (
		packageName !== WORKFLOW_PACKAGE &&
		path.startsWith(`${packageDir}/`) &&
		path.endsWith(".ts") &&
		!path.endsWith(".test.ts")
	);
}

/**
 * Package source does not reach `todo` from `@sekhmet/workflow`: a
 * placeholder for unwritten code must not be published. One finding per
 * use, on its line.
 */
export function checkTodo({
	path,
	text,
	views,
	packageDir,
}: {
	path: string;
	text: string;
	views: SourceViews;
	packageDir: string;
}): Finding[] {
	return todoUses({ views, path, packageDir }).map((use) => {
		return {
			check: "todo",
			file: path,
			line: lineAt({ text, index: use.index }),
			message: `package source ${describeUse(use)}; write the code, or mark a deliberate gap with unimplemented(), before publishing`,
		};
	});
}

function describeUse(use: TodoUse): string {
	switch (use.kind) {
		case "import": {
			return "imports todo from @sekhmet/workflow";
		}
		case "re-export": {
			return "re-exports todo from @sekhmet/workflow";
		}
		case "namespace": {
			return `uses todo from @sekhmet/workflow through ${use.namespace}`;
		}
		case "dynamic-import": {
			return "dynamically imports todo's module from @sekhmet/workflow";
		}
	}
}
