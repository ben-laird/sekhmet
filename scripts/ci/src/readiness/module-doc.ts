import type { Finding } from "./finding.ts";
import { type Member, memberPath, type WorkspaceFiles } from "./workspace.ts";

/**
 * The `/** … *\/` block a module opens with, after any blank lines and `//`
 * line comments (such as a generated main barrel's `// GENERATED` header).
 */
const LEADING_DOC_BLOCK: RegExp =
	/^(?:\s*\/\/[^\n]*(?:\n|$))*\s*(\/\*\*(?!\/)[\s\S]*?\*\/)/;

/** A `@module` tag at the start of a JSDoc line. */
const MODULE_TAG: RegExp = /(?:^|\n)[ \t]*\*?[ \t]*@module\b/;

/**
 * The doc block a module opens with, if any: a `/** … *\/` comment that comes
 * before any code, after blank lines and `//` line comments.
 */
export function leadingDocBlock(text: string): string | undefined {
	return LEADING_DOC_BLOCK.exec(text)?.[1];
}

/**
 * The module doc of a source text: its leading doc block when that block
 * carries a `@module` tag, as JSR reads it.
 */
export function moduleDoc(text: string): string | undefined {
	const block = leadingDocBlock(text);
	if (block === undefined) return undefined;
	const body = block.slice("/**".length, -"*/".length);
	if (!MODULE_TAG.test(body)) return undefined;
	return block;
}

/**
 * Every `exports` target of a published package opens with a module doc, so
 * JSR's "all entrypoints are documented" score holds. A target that does not
 * exist is the `exports` check's to report.
 */
export function checkModuleDocs({
	member,
	files,
}: {
	member: Member;
	files: WorkspaceFiles;
}): Finding[] {
	const subpathsByPath = new Map<string, string[]>();
	for (const [subpath, target] of Object.entries(member.manifest.exports)) {
		const path = memberPath({ member, path: target });
		subpathsByPath.set(path, [...(subpathsByPath.get(path) ?? []), subpath]);
	}

	const findings: Finding[] = [];
	for (const [path, subpaths] of subpathsByPath) {
		const text = files.get(path);
		if (text === undefined) continue;
		const problem = moduleDocProblem(text);
		if (problem === undefined) continue;
		const entrypoint = `entrypoint ${subpaths.map((s) => `"${s}"`).join(", ")}`;
		findings.push({
			check: "module-doc",
			file: path,
			line: 1,
			message: `${entrypoint} ${problem}; JSR scores a module doc on every entrypoint`,
		});
	}
	return findings;
}

/** Why a source text has no module doc, or `undefined` when it has one. */
function moduleDocProblem(text: string): string | undefined {
	if (moduleDoc(text) !== undefined) return undefined;
	if (leadingDocBlock(text) === undefined) {
		return "does not open with a /** … @module */ doc";
	}
	return "opens with a doc block that has no @module tag";
}
