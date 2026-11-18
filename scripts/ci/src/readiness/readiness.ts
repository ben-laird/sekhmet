import { dirname } from "@std/path/posix";
import type { CheckId, Finding } from "./finding.ts";
import { checkGivenWhenThen } from "./given-when-then.ts";
import { checkImports } from "./imports.ts";
import { checkModuleDocs } from "./module-doc.ts";
import { checkModuleState, isStatelessSource } from "./module-state.ts";
import {
	checkExports,
	checkPackageFiles,
	checkPublishExclude,
} from "./package.ts";
import { sourceViews } from "./source.ts";
import { checkSpecifiers } from "./specifiers.ts";
import { checkTodo, isTodoCheckedPath } from "./todo.ts";
import {
	type Manifest,
	type Member,
	memberRoots,
	membersUnder,
	parseManifest,
	type WorkspaceFiles,
} from "./workspace.ts";

/** Where the root manifest lives. */
export const ROOT_MANIFEST = "deno.json";

/** The directory of library packages, the ones bound for JSR. */
export const PACKAGES_ROOT = "packages";

/**
 * The member directories `deno doc --lint` covers: the packages and the
 * tooling under `scripts/`. The `deno task add` templates are scaffolds
 * whose exports exist only once copied, so they are left out.
 */
export const DOC_LINT_ROOTS: readonly string[] = [PACKAGES_ROOT, "scripts"];

/** The checks {@linkcode staticFindings} runs. */
export const STATIC_CHECKS: ReadonlySet<CheckId> = new Set<CheckId>([
	"package-files",
	"license",
	"exports",
	"imports",
	"publish-exclude",
	"given-when-then",
	"specifiers",
	"module-state",
	"todo",
	"module-doc",
]);

/**
 * The workspace as the checks see it: the root manifest and every member.
 */
export interface Workspace {
	/** The parsed root `deno.json` */
	root: Manifest;
	/** The root `deno.json` text, for line numbers */
	rootText: string;
	/** Every workspace member, sorted by directory */
	members: Member[];
}

/**
 * Reads the workspace layout from its files: the root manifest's
 * `workspace` globs, then each member's manifest.
 */
export function readWorkspace(
	files: WorkspaceFiles,
):
	| { ok: true; value: Workspace; findings: Finding[] }
	| { ok: false; error: Finding } {
	const rootText = files.get(ROOT_MANIFEST);
	if (rootText === undefined) {
		return {
			ok: false,
			error: {
				check: "exports",
				file: ROOT_MANIFEST,
				message: "no root deno.json",
			},
		};
	}
	const root = parseManifest({ path: ROOT_MANIFEST, text: rootText });
	if (!root.ok) return root;
	const { members, findings } = membersUnder({
		files,
		roots: memberRoots(root.value),
	});
	return { ok: true, value: { root: root.value, rootText, members }, findings };
}

/**
 * Whether a member is a library package under {@linkcode PACKAGES_ROOT}.
 */
export function isPackage(member: Member): boolean {
	return dirname(member.dir) === PACKAGES_ROOT;
}

/**
 * The members `deno doc --lint` covers: those directly under a
 * {@linkcode DOC_LINT_ROOTS} directory.
 */
export function docLintMembers(workspace: Workspace): Member[] {
	return workspace.members.filter((member) =>
		DOC_LINT_ROOTS.includes(dirname(member.dir)),
	);
}

/**
 * Runs every check that reads files only (all but `doc-lint`):
 *
 * - published packages: `package-files`, `license`, `module-doc`
 * - every package: `exports`, and `imports` over its non-test source
 * - the root manifest: `publish-exclude`
 * - every `*.test.ts`: `given-when-then`
 * - every `README.md`, and JSDoc in package source: `specifiers`
 * - non-test source under a stateless root: `module-state`
 * - non-test source of every package but `@sekhmet/workflow`: `todo`
 */
export function staticFindings(files: WorkspaceFiles): Finding[] {
	const workspace = readWorkspace(files);
	if (!workspace.ok) return [workspace.error];
	const { root, rootText, members } = workspace.value;
	const findings = [...workspace.findings];
	const packages = members.filter(isPackage);
	const byName = new Map(
		members.flatMap((member) =>
			member.manifest.name === undefined
				? []
				: [[member.manifest.name, member] as const],
		),
	);

	findings.push(
		...checkPublishExclude({ root, rootPath: ROOT_MANIFEST, rootText }),
	);
	for (const member of packages) {
		if (member.manifest.publish) {
			findings.push(...checkPackageFiles({ member, files }));
			findings.push(...checkModuleDocs({ member, files }));
		}
		findings.push(...checkExports({ member, files }));
	}

	for (const [path, text] of files) {
		if (path.endsWith("/README.md") || path === "README.md") {
			findings.push(...checkSpecifiers({ path, text, packages: byName }));
		}
		if (!path.endsWith(".ts")) continue;

		const isTest = path.endsWith(".test.ts");
		const owner = packages.find((member) => {
			return path.startsWith(`${member.dir}/`);
		});
		const inPackage = owner !== undefined;
		if (!isTest && !inPackage) continue;

		const views = sourceViews(text);
		if (isTest) {
			findings.push(...checkGivenWhenThen({ path, text, views }));
		} else {
			findings.push(...checkImports({ path, text, views }));
			findings.push(
				...checkSpecifiers({ path, text: views.comments, packages: byName }),
			);
			if (isStatelessSource(path)) {
				findings.push(...checkModuleState({ path, text, views }));
			}
		}
		if (
			owner !== undefined &&
			isTodoCheckedPath({
				path,
				packageDir: owner.dir,
				packageName: owner.manifest.name,
			})
		) {
			findings.push(...checkTodo({ path, text, views, packageDir: owner.dir }));
		}
	}

	return findings;
}
