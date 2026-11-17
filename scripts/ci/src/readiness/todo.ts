import type { Finding } from "./finding.ts";
import { lineAt, type SourceViews } from "./source.ts";

/**
 * How a module can name `@sekhmet/workflow`'s `todo`: by local names bound to
 * the function itself (`import { todo }`, `import { todo as t }`), or by
 * namespaces whose `todo` member it is (`import * as workflow`).
 */
export interface TodoBindings {
	/** Local names bound to `todo` */
	names: string[];
	/** Local namespace names whose `.todo` is `todo` */
	namespaces: string[];
}

/** An `import … from "…"` statement, but not `import type`. */
const IMPORT_FROM =
	/\bimport\s+(?!type\b)([^;"'`]*?)\s*\bfrom\s*(["'])([^"'\n]+)\2/g;

const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const NAMESPACE = new RegExp(`\\*\\s*as\\s+(${IDENTIFIER})`);

const NAMED_TODO = new RegExp(`^todo(?:\\s+as\\s+(${IDENTIFIER}))?$`);

/**
 * Whether a specifier names `@sekhmet/workflow` or one of its subpaths,
 * bare or as a `jsr:` specifier with an optional version.
 */
export function isWorkflowSpecifier(specifier: string): boolean {
	return /^(?:jsr:)?@sekhmet\/workflow(?:@[^/]*)?(?:\/.*)?$/.test(specifier);
}

/**
 * The names a module binds to `@sekhmet/workflow`'s `todo`, read from its
 * value imports (type-only imports cannot be called).
 */
export function todoBindings(views: SourceViews): TodoBindings {
	const names: string[] = [];
	const namespaces: string[] = [];
	for (const [, clause = "", , specifier = ""] of views.code.matchAll(
		IMPORT_FROM,
	)) {
		if (!isWorkflowSpecifier(specifier)) {
			continue;
		}
		const namespace = NAMESPACE.exec(clause)?.[1];
		if (namespace !== undefined) {
			namespaces.push(namespace);
		}
		names.push(...namedTodos(clause));
	}
	return { names, namespaces };
}

/** The local names `{ … }` binds to `todo`, skipping `type` specifiers. */
function namedTodos(clause: string): string[] {
	const braces = /\{([^}]*)\}/.exec(clause)?.[1];
	if (braces === undefined) {
		return [];
	}
	return braces.split(",").flatMap((part) => {
		const match = NAMED_TODO.exec(part.trim());
		if (match === null) {
			return [];
		}
		return [match[1] ?? "todo"];
	});
}

/**
 * The indices of every call of `todo` through its bindings: `t(` for a bound
 * name and `ns.todo(` for a namespace. It reads the structure view, so calls
 * in comments and strings do not count, and `x.todo(` on another object is
 * not a call of a bound name.
 */
export function todoCallIndices({
	views,
	bindings,
}: {
	views: SourceViews;
	bindings: TodoBindings;
}): number[] {
	const callees = [
		...bindings.names.map(escapeRegExp),
		...bindings.namespaces.map((namespace) => {
			return `${escapeRegExp(namespace)}\\s*\\.\\s*todo`;
		}),
	];
	if (callees.length === 0) {
		return [];
	}
	const call = new RegExp(
		`(?<![\\w$.])(?:${callees.join("|")})\\s*(?:\\?\\.\\s*)?\\(`,
		"g",
	);
	return [...views.structure.matchAll(call)].map(({ index }) => index);
}

/**
 * Whether the `todo` check covers a file: non-test TypeScript under a
 * package's `src/`. Tests, the playground and `scripts/` may call `todo`.
 */
export function isTodoCheckedPath({
	path,
	packageDir,
}: {
	path: string;
	packageDir: string;
}): boolean {
	return (
		path.startsWith(`${packageDir}/src/`) &&
		path.endsWith(".ts") &&
		!path.endsWith(".test.ts")
	);
}

/**
 * Package source calls no `todo` from `@sekhmet/workflow`: a placeholder for
 * unwritten code must not be published. One finding per call, on its line.
 */
export function checkTodo({
	path,
	text,
	views,
}: {
	path: string;
	text: string;
	views: SourceViews;
}): Finding[] {
	const bindings = todoBindings(views);
	return todoCallIndices({ views, bindings }).map((index) => {
		return {
			check: "todo",
			file: path,
			line: lineAt({ text, index }),
			message:
				"package source calls todo() from @sekhmet/workflow; write the code, or mark a deliberate gap with unimplemented(), before publishing",
		};
	});
}

function escapeRegExp(text: string): string {
	return text.replace(/[$]/g, "\\$&");
}
