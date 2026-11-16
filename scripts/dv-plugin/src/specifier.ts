const SCOPED_NAME = /^(?:jsr:|npm:)?\/?(@[^/@]+\/[^/@]+)/;
const VERSIONED =
	/^((?:jsr:|npm:)\/?@[^/@]+\/[^/@]+)@([\^~]?)(\d[\w.+-]*)(\/.*)?$/;

/**
 * Extracts the scoped package name (`@scope/name`) a module specifier points
 * at, ignoring a `jsr:`/`npm:` prefix, a version and a subpath.
 *
 * @param specifier A bare (`@sekhmet/enum/result`) or registry
 *   (`jsr:@sekhmet/enum@^0.1.0/result`) specifier.
 * @returns The package name, or `undefined` for relative, URL or unscoped
 *   specifiers.
 */
export function packageNameOf(specifier: string): string | undefined {
	return SCOPED_NAME.exec(specifier)?.[1];
}

/**
 * Points a registry specifier at a new version, keeping its prefix, range
 * operator (`^`, `~` or exact) and subpath.
 *
 * @param args.specifier The current specifier, e.g. `jsr:@sekhmet/enum@^0.1.0`.
 * @param args.version The version to point at.
 * @returns The rewritten specifier, or the original when it carries no
 *   version to rewrite (a bare workspace specifier, for example).
 */
export function withVersion({
	specifier,
	version,
}: {
	specifier: string;
	version: string;
}): string {
	const parts = VERSIONED.exec(specifier);
	if (parts === null) return specifier;
	const [, prefix, range, , subpath] = parts;
	return `${prefix}@${range}${version}${subpath ?? ""}`;
}
