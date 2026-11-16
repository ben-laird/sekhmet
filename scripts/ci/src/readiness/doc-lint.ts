import { relative } from "@std/path/posix";
import type { Finding } from "./finding.ts";
import { lineOfKey, type Member } from "./workspace.ts";

const DIAGNOSTIC = /^error\[([\w-]+)\]: (.+)$/;
const LOCATION = /^\s*-->\s+(.+):(\d+):\d+$/;
const SUMMARY = /^error: Found \d+ documentation lint errors?\.$/;

/**
 * The `deno doc --lint` arguments that lint a package over its export set,
 * which is what JSR documents. Run from the package directory.
 */
export function docLintArgs(member: Member): string[] {
	return ["doc", "--lint", ...new Set(Object.values(member.manifest.exports))];
}

/**
 * Turns `deno doc --lint` output (run with `NO_COLOR`) into findings at
 * repo-relative paths. Each diagnostic becomes a `doc-lint` finding whose
 * message carries the lint code, e.g.
 * `private-type-ref: public type 'Enum' references private type 'Struct'`.
 * Any other error (a missing module, a crash) becomes a finding on the
 * package's `deno.json`, so a failed run never passes silently.
 */
export function parseDocLint({
	member,
	output,
	success,
	repoRoot,
}: {
	member: Member;
	output: string;
	success: boolean;
	repoRoot: string;
}): Finding[] {
	const findings: Finding[] = [];
	const lines = output.split("\n");
	const exportsLine = lineOfKey({ text: member.manifestText, key: "exports" });
	const atManifest = {
		check: "doc-lint",
		file: member.manifestPath,
		...(exportsLine === undefined ? {} : { line: exportsLine }),
	} as const;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const diagnostic = DIAGNOSTIC.exec(line);
		if (diagnostic) {
			const [, code, message] = diagnostic;
			const location = LOCATION.exec(lines[i + 1] ?? "");
			const [, absolute, lineNumber] = location ?? [];
			findings.push(
				absolute === undefined || lineNumber === undefined
					? { ...atManifest, message: `${code}: ${message}` }
					: {
							check: "doc-lint",
							file: relativePath({ repoRoot, absolute }),
							line: Number(lineNumber),
							message: `${code}: ${message}`,
						},
			);
		} else if (line.startsWith("error:") && !SUMMARY.test(line)) {
			findings.push({
				...atManifest,
				message: `deno doc --lint failed for ${member.manifest.name ?? member.dir}: ${line.slice("error:".length).trim()}`,
			});
		}
	}

	if (!success && findings.length === 0) {
		findings.push({
			...atManifest,
			message: `deno doc --lint failed for ${member.manifest.name ?? member.dir} without a diagnostic: ${output.trim().slice(0, 500)}`,
		});
	}
	return findings;
}

function relativePath({
	repoRoot,
	absolute,
}: {
	repoRoot: string;
	absolute: string;
}): string {
	const path = absolute.startsWith("file://")
		? decodeURIComponent(new URL(absolute).pathname)
		: absolute;
	return relative(repoRoot, path);
}
