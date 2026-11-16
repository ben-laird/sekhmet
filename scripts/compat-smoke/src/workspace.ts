/**
 * Which packages the repository publishes: every `packages/*` manifest that
 * is not marked `"publish": false`.
 *
 * @module
 */

import { z } from "zod";
import { isPackageName, type PackageName } from "@/src/package.ts";
import { err, ok, type Result } from "@/src/result.ts";

const Manifest = z.object({
	name: z.string().refine(isPackageName, "not a JSR package name"),
	publish: z.unknown().optional(),
});

/**
 * Reads the published package names out of the package manifests.
 *
 * @param manifests - Each `packages/<dir>/deno.json`, parsed, keyed by path
 * @returns The names, sorted, or the first manifest that cannot be read
 */
export function publishedNames(
	manifests: ReadonlyMap<string, unknown>,
): Result<PackageName[], string> {
	const names: PackageName[] = [];
	for (const [path, json] of manifests) {
		const parsed = Manifest.safeParse(json);
		if (!parsed.success) {
			return err(`${path}: ${z.prettifyError(parsed.error)}`);
		}
		const { name, publish } = parsed.data;
		if (publish !== false && isPackageName(name)) names.push(name);
	}
	return ok(names.sort());
}
