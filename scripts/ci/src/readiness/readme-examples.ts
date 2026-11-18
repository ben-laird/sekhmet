import type { Finding } from "./finding.ts";
import { moduleDoc } from "./module-doc.ts";
import { type Member, memberPath, type WorkspaceFiles } from "./workspace.ts";

/** A line that opens a fenced code block in markdown. */
const MARKDOWN_FENCE: RegExp = /^[ \t]*(?:```|~~~)/m;

/** A code fence or an `@example` tag, in a JSDoc block. */
const DOC_EXAMPLE: RegExp = /```|~~~|(?:^|\n)[ \t]*\*?[ \t]*@example\b/;

/**
 * A published package shows a code example, so JSR's "has examples in the
 * README or module doc" score holds: its `README.md` has a fenced code block,
 * or its `"."` entrypoint's module doc has a fence or an `@example`. A
 * missing README is the `package-files` check's to report.
 *
 * JSR also counts a markdown indented code block; this check does not, since
 * an indented list continuation reads the same and is no example.
 */
export function checkReadmeExamples({
	member,
	files,
}: {
	member: Member;
	files: WorkspaceFiles;
}): Finding[] {
	const readme = memberPath({ member, path: "README.md" });
	const text = files.get(readme);
	if (text === undefined || MARKDOWN_FENCE.test(text)) return [];
	if (hasMainEntrypointExample({ member, files })) return [];
	return [
		{
			check: "readme-examples",
			file: readme,
			message:
				'README.md has no fenced code example; JSR scores a code block in the README or in the "." entrypoint\'s module doc',
		},
	];
}

/** Whether the `"."` entrypoint's module doc has a code example. */
function hasMainEntrypointExample({
	member,
	files,
}: {
	member: Member;
	files: WorkspaceFiles;
}): boolean {
	const target = member.manifest.exports["."];
	if (target === undefined) return false;
	const text = files.get(memberPath({ member, path: target }));
	if (text === undefined) return false;
	const doc = moduleDoc(text);
	return doc !== undefined && DOC_EXAMPLE.test(doc);
}
