/**
 * Published packages: their JSR names, the npm names JSR serves them under,
 * and the import specifiers their export maps expose.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";

declare const PACKAGE_NAME: unique symbol;

/** A JSR package name such as `@sekhmet/enum`. */
export type PackageName = string & { readonly [PACKAGE_NAME]: true };

const PACKAGE_NAME_PATTERN = /^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/;

/**
 * Whether a string is a JSR package name (`@scope/name`).
 *
 * @param text - The candidate name
 * @returns `true` when `text` is a package name
 */
export function isPackageName(text: string): text is PackageName {
	return PACKAGE_NAME_PATTERN.test(text);
}

/**
 * Parses a JSR package name.
 *
 * @param text - The candidate name
 * @returns The name, or a message saying why it is not one
 */
export function parsePackageName(text: string): Result<PackageName, string> {
	return isPackageName(text)
		? Ok(text)
		: Err(`not a JSR package name (@scope/name): ${text}`);
}

/**
 * The name JSR's npm registry (`https://npm.jsr.io`) serves a package under:
 * `@sekhmet/enum` is `@jsr/sekhmet__enum`.
 *
 * @param name - The JSR package name
 * @returns The npm package name
 */
export function npmName(name: PackageName): string {
	const [, scope, bare] = PACKAGE_NAME_PATTERN.exec(name) ?? [];
	return `@jsr/${scope}__${bare}`;
}

/** One version of a package as published on JSR. */
export interface PublishedPackage {
	/** The JSR name */
	readonly name: PackageName;
	/** The exact version under test */
	readonly version: string;
	/** The `exports` map the version was published with */
	readonly exports: Readonly<Record<string, string>>;
}

/** One import specifier a package exposes, such as `@sekhmet/enum/option`. */
export interface ExportPath {
	/** The package that exposes it */
	readonly package: PackageName;
	/** The bare specifier a user imports */
	readonly specifier: string;
}

/**
 * Every import specifier a published package exposes, in export-map order:
 * `.` is the package name itself and `./x` is `name/x`.
 *
 * @param pkg - The published package
 * @returns One export path per export-map key
 */
export function exportPaths(pkg: PublishedPackage): ExportPath[] {
	return Object.keys(pkg.exports).map((key) => ({
		package: pkg.name,
		specifier:
			key === "." ? pkg.name : `${pkg.name}/${key.replace(/^\.\//, "")}`,
	}));
}
