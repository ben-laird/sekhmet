// deno-coverage-ignore-file
import { join, relative, SEPARATOR } from "@std/path";

/** Directories never read anywhere, besides dot-directories. */
const SKIPPED_DIRS = new Set(["node_modules"]);
/**
 * Root directories never read: the report `deno test --coverage` writes, and
 * the gitignored scratch in `playground/`.
 */
const SKIPPED_ROOT_DIRS = new Set(["coverage", "playground"]);

/**
 * Reads every `.ts` file, `.md` file and `deno.json` under a root, keyed by
 * repo-relative POSIX path: the input the pure readiness and coverage code
 * takes. Dot-directories (`.git`, `.claude`), `node_modules` and the root
 * `coverage/` and `playground/` are skipped.
 *
 * @param root - Absolute path of the repo root
 * @returns The files' texts by path
 */
export async function readWorkspaceFiles(
	root: string,
): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const visit = async (dir: string): Promise<void> => {
		for await (const entry of Deno.readDir(dir)) {
			const path = join(dir, entry.name);
			if (entry.isDirectory) {
				const skipped =
					entry.name.startsWith(".") ||
					SKIPPED_DIRS.has(entry.name) ||
					(dir === root && SKIPPED_ROOT_DIRS.has(entry.name));
				if (!skipped) {
					await visit(path);
				}
			} else if (
				entry.isFile &&
				(entry.name.endsWith(".ts") ||
					entry.name.endsWith(".md") ||
					entry.name === "deno.json")
			) {
				const key = relative(root, path).split(SEPARATOR).join("/");
				files.set(key, await Deno.readTextFile(path));
			}
		}
	};
	await visit(root);
	return files;
}
