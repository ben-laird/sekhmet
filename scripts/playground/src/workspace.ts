/**
 * Reads the workspace packages' manifests from disk.
 *
 * @module
 */

import { decodeManifest, type PackageManifest } from "@/src/discover.ts";

/** The manifests that decoded, and a warning for each one that did not. */
export interface Manifests {
	/** Every package manifest that decoded. */
	readonly manifests: readonly PackageManifest[];
	/** One line per `deno.json` that could not be read as a package. */
	readonly warnings: readonly string[];
}

/**
 * Reads `packages/<name>/deno.json` for every package directory under `root`.
 *
 * @param root - The repository root
 * @returns The decoded manifests, sorted by directory, and any warnings
 */
export async function readManifests(root: URL): Promise<Manifests> {
	const packages = new URL("packages/", root);
	const directories: string[] = [];
	for await (const entry of Deno.readDir(packages)) {
		if (entry.isDirectory) directories.push(entry.name);
	}
	directories.sort();

	const manifests: PackageManifest[] = [];
	const warnings: string[] = [];
	for (const directory of directories) {
		const path = `packages/${directory}/deno.json`;
		const text = await readIfExists(new URL(path, root));
		if (text === undefined) continue;

		const decoded = decodeManifest(parseJson(text));
		if (decoded.ok) manifests.push(decoded.value);
		else warnings.push(`${path}: ${decoded.error}`);
	}

	return { manifests, warnings };
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

async function readIfExists(url: URL): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(url);
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}
