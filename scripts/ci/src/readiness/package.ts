import { globToRegExp } from "@std/path/glob-to-regexp";
import type { Finding } from "./finding.ts";
import { sourceViews } from "./source.ts";
import {
	lineOfKey,
	type Manifest,
	type Member,
	memberPath,
	type WorkspaceFiles,
} from "./workspace.ts";

/** The license every published package carries. */
export const LICENSE_ID = "MIT";

/**
 * A published package has a `README.md` and a `LICENSE.md`, and its
 * `license` field is {@linkcode LICENSE_ID} and agrees with the LICENSE text.
 */
export function checkPackageFiles({
	member,
	files,
}: {
	member: Member;
	files: WorkspaceFiles;
}): Finding[] {
	const findings: Finding[] = [];
	const name = member.manifest.name ?? member.dir;
	const readme = memberPath({ member, path: "README.md" });
	const licensePath = memberPath({ member, path: "LICENSE.md" });

	if (!files.has(readme)) {
		findings.push({
			check: "package-files",
			file: readme,
			message: `published package ${name} has no README.md`,
		});
	}

	const licenseText = files.get(licensePath);
	if (licenseText === undefined) {
		findings.push({
			check: "package-files",
			file: licensePath,
			message: `published package ${name} has no LICENSE.md`,
		});
	}

	const field = member.manifest.license;
	const fieldLine = lineOfKey({ text: member.manifestText, key: "license" });
	if (field !== LICENSE_ID) {
		findings.push({
			check: "license",
			file: member.manifestPath,
			...(fieldLine === undefined ? {} : { line: fieldLine }),
			message:
				field === undefined
					? `add "license": "${LICENSE_ID}"`
					: `"license" is "${field}", expected "${LICENSE_ID}"`,
		});
	} else if (
		licenseText !== undefined &&
		!/^\s*#*\s*MIT License\b/.test(licenseText)
	) {
		findings.push({
			check: "license",
			file: licensePath,
			line: 1,
			message: `"license" is "${LICENSE_ID}" in ${member.manifestPath}, but LICENSE.md does not start with "MIT License"`,
		});
	}

	return findings;
}

/**
 * Every `exports` path of a package resolves to an existing module that is
 * not empty: it has content and at least one `export`.
 */
export function checkExports({
	member,
	files,
}: {
	member: Member;
	files: WorkspaceFiles;
}): Finding[] {
	const findings: Finding[] = [];
	const exportsLine = lineOfKey({ text: member.manifestText, key: "exports" });
	const entries = Object.entries(member.manifest.exports);

	if (entries.length === 0) {
		findings.push({
			check: "exports",
			file: member.manifestPath,
			...(exportsLine === undefined ? {} : { line: exportsLine }),
			message: "a published package needs at least one export",
		});
	}

	for (const [subpath, target] of entries) {
		const line =
			lineOfKey({ text: member.manifestText, key: subpath }) ?? exportsLine;
		const at = {
			check: "exports",
			file: member.manifestPath,
			...(line === undefined ? {} : { line }),
		} as const;
		const path = memberPath({ member, path: target });
		const text = files.get(path);

		if (text === undefined) {
			findings.push({
				...at,
				message: `export "${subpath}" points to ${path}, which does not exist`,
			});
		} else if (text.trim() === "") {
			findings.push({
				...at,
				message: `export "${subpath}" points to ${path}, which is empty`,
			});
		} else if (!/\bexport\b/.test(sourceViews(text).code)) {
			findings.push({
				...at,
				message: `export "${subpath}" points to ${path}, which exports nothing`,
			});
		}
	}

	return findings;
}

/** Paths a test file can have, which `publish.exclude` must cover. */
const TEST_FILE_SAMPLES = [
	"packages/example/mod.test.ts",
	"packages/example/src/feature/mini/feature.test.ts",
] as const;

/**
 * The root `publish.exclude` keeps every `*.test.ts` out of published
 * packages.
 */
export function checkPublishExclude({
	root,
	rootPath,
	rootText,
}: {
	root: Manifest;
	rootPath: string;
	rootText: string;
}): Finding[] {
	const patterns = root.publishExclude.map((glob) =>
		globToRegExp(glob, { extended: true, globstar: true }),
	);
	const uncovered = TEST_FILE_SAMPLES.filter(
		(sample) => !patterns.some((pattern) => pattern.test(sample)),
	);
	if (uncovered.length === 0) return [];

	const line = lineOfKey({ text: rootText, key: "publish" });
	return [
		{
			check: "publish-exclude",
			file: rootPath,
			...(line === undefined ? {} : { line }),
			message: `"publish.exclude" does not cover test files such as ${uncovered.join(", ")}; add "**/*.test.ts"`,
		},
	];
}
