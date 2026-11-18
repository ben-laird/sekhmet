// deno-coverage-ignore-file
import { parseArgs } from "@std/cli";
import { join, resolve } from "@std/path";
import { triage } from "@/src/readiness/allowlist.ts";
import { ALLOWLIST } from "@/src/readiness/allowlisted.ts";
import { docLintArgs, parseDocLint } from "@/src/readiness/doc-lint.ts";
import {
	type CheckId,
	compareFindings,
	type Finding,
	type FindingFormat,
	formatFinding,
} from "@/src/readiness/finding.ts";
import {
	docLintMembers,
	readWorkspace,
	STATIC_CHECKS,
	staticFindings,
} from "@/src/readiness/readiness.ts";
import { readWorkspaceFiles } from "@/src/workspace-files.ts";

/**
 * The publish-readiness runner, the I/O edge around the pure checks in
 * `src/readiness/`. It reads the repo's files (or runs `deno doc --lint`),
 * triages the findings against the allowlist and prints them one per line;
 * it exits 1 when any finding is not allowlisted.
 *
 * Usage: `readiness.ts <static|doc-lint> [--root <dir>] [--no-allowlist]`
 *
 * - `static`: every check that reads files (README, LICENSE, exports,
 *   entrypoint module docs, imports, publish.exclude, Given/When/Then,
 *   README/JSDoc specifiers, module state, `todo`)
 * - `doc-lint`: `deno doc --lint` per workspace member over its export set
 *
 * `--no-allowlist` triages without this repo's allowlist, for a `--root`
 * that is another repo.
 *
 * Output is `file:line: error[check]: message`, or GitHub Actions
 * annotations when `GITHUB_ACTIONS=true`.
 */
export async function main(args: string[]): Promise<number> {
	const {
		_: [mode],
		root: rootArg = Deno.cwd(),
		allowlist: useAllowlist,
	} = parseArgs(args, {
		string: ["root"],
		boolean: ["allowlist"],
		negatable: ["allowlist"],
		default: { allowlist: true },
	});
	const root = resolve(rootArg);
	const format: FindingFormat =
		Deno.env.get("GITHUB_ACTIONS") === "true" ? "github" : "text";
	const files = await readWorkspaceFiles(root);

	let findings: Finding[];
	let checks: ReadonlySet<CheckId>;
	switch (mode) {
		case "static": {
			findings = staticFindings(files);
			checks = STATIC_CHECKS;
			break;
		}
		case "doc-lint": {
			findings = await docLintFindings({ files, root });
			checks = new Set<CheckId>(["doc-lint"]);
			break;
		}
		default: {
			console.error(
				"Usage: readiness.ts <static|doc-lint> [--root <dir>] [--no-allowlist]",
			);
			return 2;
		}
	}

	const { errors, allowlisted } = triage({
		findings,
		allowlist: useAllowlist ? ALLOWLIST : [],
		checks,
		allowlistPath: "scripts/ci/src/readiness/allowlisted.ts",
	});
	for (const finding of errors.toSorted(compareFindings)) {
		console.log(formatFinding({ finding, format }));
	}
	for (const { finding, until } of allowlisted.toSorted((a, b) =>
		compareFindings(a.finding, b.finding),
	)) {
		console.log(formatFinding({ finding, format, allowlistedUntil: until }));
	}
	const issues = [...new Set(allowlisted.map(({ until }) => until))].sort();
	console.log(
		`${mode}: ${errors.length} error(s), ${allowlisted.length} allowlisted${issues.length > 0 ? ` (until ${issues.join(", ")})` : ""}`,
	);
	return errors.length > 0 ? 1 : 0;
}

async function docLintFindings({
	files,
	root,
}: {
	files: ReadonlyMap<string, string>;
	root: string;
}): Promise<Finding[]> {
	const workspace = readWorkspace(files);
	if (!workspace.ok) return [workspace.error];
	const results = await Promise.all(
		docLintMembers(workspace.value).map(async (member) => {
			const output = await new Deno.Command("deno", {
				args: docLintArgs(member),
				cwd: join(root, member.dir),
				env: { NO_COLOR: "1" },
			}).output();
			const decoder = new TextDecoder();
			return parseDocLint({
				member,
				output: decoder.decode(output.stdout) + decoder.decode(output.stderr),
				success: output.success,
				repoRoot: root,
			});
		}),
	);
	return [...workspace.findings, ...results.flat()];
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
