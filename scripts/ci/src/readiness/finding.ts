/**
 * The readiness checks, by the id that prefixes each finding.
 *
 * - `package-files`: a published package has `README.md` and `LICENSE.md`
 * - `license`: its `license` field is `"MIT"` and matches the LICENSE text
 * - `exports`: every `exports` path is an existing, non-empty module
 * - `imports`: package source imports only relative, `@/`, `@sekhmet/*` and
 *   `@std/*` specifiers
 * - `publish-exclude`: the root `publish.exclude` keeps tests out of packages
 * - `given-when-then`: every test and step has Given/When/Then comments
 * - `specifiers`: `@sekhmet/*` imports in READMEs and JSDoc name real exports
 * - `module-state`: stateless package source declares no top-level mutable
 *   state (a `let`/`var`, or a `Map`/`Set` registry)
 * - `todo`: package source does not import, re-export or reach `todo`
 *   from `@sekhmet/workflow`
 * - `module-doc`: every `exports` target of a published package opens with a
 *   `@module` doc, as JSR's score asks of every entrypoint
 * - `readme-examples`: a published package's README (or its `"."` module
 *   doc) has a code example, as JSR's score asks
 * - `doc-lint`: `deno doc --lint` over each package's export set
 * - `allowlist`: an allowlist entry that no longer matches a finding
 */
export type CheckId =
	| "package-files"
	| "license"
	| "exports"
	| "imports"
	| "publish-exclude"
	| "given-when-then"
	| "specifiers"
	| "module-state"
	| "todo"
	| "module-doc"
	| "readme-examples"
	| "doc-lint"
	| "allowlist";

/**
 * One readiness failure, located at a repo-relative file and, when known, a
 * 1-based line.
 */
export interface Finding {
	/** The check that found it */
	check: CheckId;
	/** Repo-relative path of the file to fix (or to create) */
	file: string;
	/** 1-based line in `file`, when the failure has one */
	line?: number;
	/** What is wrong and, where it helps, how to fix it */
	message: string;
}

/**
 * How findings are printed: `text` is `file:line: severity[check]: message`
 * (one per line, for people and agents), `github` is GitHub Actions workflow
 * commands, which annotate the file in the PR.
 */
export type FindingFormat = "text" | "github";

/**
 * Renders one finding. An allowlisted finding is a warning that names the
 * issue it waits on; any other finding is an error.
 */
export function formatFinding({
	finding,
	format,
	allowlistedUntil,
}: {
	finding: Finding;
	format: FindingFormat;
	allowlistedUntil?: string;
}): string {
	const severity = allowlistedUntil === undefined ? "error" : "warning";
	const message =
		allowlistedUntil === undefined
			? finding.message
			: `${finding.message} (allowlisted until ${allowlistedUntil})`;

	switch (format) {
		case "text": {
			const at =
				finding.line === undefined
					? finding.file
					: `${finding.file}:${finding.line}`;
			return `${at}: ${severity}[${finding.check}]: ${message}`;
		}
		case "github": {
			const line = finding.line === undefined ? "" : `,line=${finding.line}`;
			return `::${severity} file=${finding.file}${line},title=${finding.check}::${escapeData(message)}`;
		}
	}
}

/** Escapes a GitHub Actions workflow command's message. */
function escapeData(message: string): string {
	return message
		.replaceAll("%", "%25")
		.replaceAll("\r", "%0D")
		.replaceAll("\n", "%0A");
}

/**
 * Orders findings by file, then line, then check, so output is stable.
 */
export function compareFindings(a: Finding, b: Finding): number {
	return (
		a.file.localeCompare(b.file) ||
		(a.line ?? 0) - (b.line ?? 0) ||
		a.check.localeCompare(b.check) ||
		a.message.localeCompare(b.message)
	);
}
