import type { Finding } from "./finding.ts";
import { lineAt } from "./source.ts";
import type { Member } from "./workspace.ts";

const SEKHMET_IMPORT =
	/\b(?:from|import)\s*\(?\s*["'](?:jsr:)?(@sekhmet\/[^"'\s]+)["']/g;

/**
 * Splits a `@sekhmet/*` specifier into its package and export subpath:
 * `@sekhmet/enum/core/mini` is package `@sekhmet/enum`, export `./core/mini`;
 * a version (`jsr:@sekhmet/enum@0.1.0/core`) is dropped.
 */
export function parseSekhmetSpecifier(specifier: string): {
	packageName: string;
	exportKey: string;
} {
	const [, nameWithVersion = "", ...rest] = specifier.split("/");
	const name = nameWithVersion.split("@")[0] ?? nameWithVersion;
	return {
		packageName: `@sekhmet/${name}`,
		exportKey: rest.length === 0 ? "." : `./${rest.join("/")}`,
	};
}

/**
 * Every `@sekhmet/*` import in a text (a README, or the comments of a source
 * file, where JSDoc examples live) names a workspace package and one of its
 * exports.
 */
export function checkSpecifiers({
	path,
	text,
	packages,
}: {
	path: string;
	text: string;
	packages: ReadonlyMap<string, Member>;
}): Finding[] {
	const findings: Finding[] = [];
	for (const match of text.matchAll(SEKHMET_IMPORT)) {
		const specifier = match[1] ?? "";
		const { packageName, exportKey } = parseSekhmetSpecifier(specifier);
		const member = packages.get(packageName);
		const line = lineAt({ text, index: match.index });

		if (member === undefined) {
			findings.push({
				check: "specifiers",
				file: path,
				line,
				message: `"${specifier}" names ${packageName}, which is not a workspace package`,
			});
		} else if (!(exportKey in member.manifest.exports)) {
			findings.push({
				check: "specifiers",
				file: path,
				line,
				message: `"${specifier}" is not an export of ${packageName}; its exports are listed in ${member.manifestPath}`,
			});
		}
	}
	return findings;
}
