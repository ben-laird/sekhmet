// deno-coverage-ignore-file
/**
 * CLI that assembles the docs site's content: it reads the root README and
 * every package's `README.md` and `docs/*.md`, and writes the pages and the
 * navigation (`site.json`) into `scripts/docs-site/content/`, which
 * VitePress then builds. The content directory is generated and ignored by
 * git. A run writes only the files whose text changed and removes only the
 * stale ones (then any directory left empty), so re-running it under a live
 * `vitepress dev` hot-updates the changed pages instead of restarting the
 * server. A docs page with unreadable frontmatter or an unknown `kind` fails
 * the run, naming the file.
 *
 * Unpublished packages are left out unless the run is passed
 * {@linkcode INCLUDE_UNPUBLISHED}, which `deno task docs:dev` does to
 * preview them locally; `deno task docs:build`, and so the deployed site,
 * never does.
 *
 * @module
 */

import { walk } from "@std/fs";
import { dirname, fromFileUrl, join, relative, SEPARATOR } from "@std/path";
import {
	type ContentChanges,
	type ContentTree,
	type DocFile,
	describePageError,
	diffContent,
	type PackageSource,
	planSite,
	siteTree,
} from "@/mod.ts";

const ROOT = fromFileUrl(new URL("../../", import.meta.url));
const PACKAGES = join(ROOT, "packages");

/** Where the assembled pages go; VitePress's `srcDir`. */
export const CONTENT_DIR: string = fromFileUrl(
	new URL("./content/", import.meta.url),
);

async function readIfExists(path: string): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(path);
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

async function readDocs(dir: string): Promise<DocFile[]> {
	const docs: DocFile[] = [];
	try {
		for await (const entry of Deno.readDir(dir)) {
			if (entry.isFile && entry.name.endsWith(".md")) {
				docs.push({
					name: entry.name,
					text: await Deno.readTextFile(join(dir, entry.name)),
				});
			}
		}
	} catch (error: unknown) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
	return docs;
}

/** A manifest publishes unless it sets `"publish": false`. */
function isPublished(manifest: unknown): boolean {
	if (typeof manifest !== "object" || manifest === null) return true;
	return !("publish" in manifest && manifest.publish === false);
}

async function readPackages(): Promise<PackageSource[]> {
	const packages: PackageSource[] = [];
	for await (const entry of Deno.readDir(PACKAGES)) {
		if (!entry.isDirectory) continue;
		const dir = join(PACKAGES, entry.name);
		packages.push({
			dir: entry.name,
			readme: await readIfExists(join(dir, "README.md")),
			docs: await readDocs(join(dir, "docs")),
			published: isPublished(
				JSON.parse(await Deno.readTextFile(join(dir, "deno.json"))),
			),
		});
	}
	return packages;
}

/** Reads every file under `dir` into a tree; a missing `dir` is an empty tree. */
async function readContentTree(dir: string): Promise<ContentTree> {
	const tree = new Map<string, string>();
	try {
		for await (const entry of walk(dir, { includeDirs: false })) {
			const path = relative(dir, entry.path).split(SEPARATOR).join("/");
			tree.set(path, await Deno.readTextFile(entry.path));
		}
	} catch (error: unknown) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
	return tree;
}

/** Removes every directory under `dir` left empty, deepest first; reports whether `dir` is empty. */
async function removeEmptyDirs(dir: string): Promise<boolean> {
	let empty = true;
	for await (const entry of Deno.readDir(dir)) {
		const path = join(dir, entry.name);
		if (entry.isDirectory && (await removeEmptyDirs(path))) {
			await Deno.remove(path);
		} else {
			empty = false;
		}
	}
	return empty;
}

/**
 * Removes, then writes, exactly the files in `changes` under `dir`; removing
 * first lets a stale file give way to a directory of the same name.
 */
async function applyChanges({
	dir,
	changes,
}: {
	readonly dir: string;
	readonly changes: ContentChanges;
}): Promise<void> {
	for (const path of changes.remove) {
		await Deno.remove(join(dir, path));
	}
	if (changes.remove.length > 0) await removeEmptyDirs(dir);
	for (const file of changes.write) {
		const path = join(dir, file.path);
		await Deno.mkdir(dirname(path), { recursive: true });
		await Deno.writeTextFile(path, file.text);
	}
}

/** The flag that previews unpublished packages, each page under a prototype banner. */
export const INCLUDE_UNPUBLISHED = "--include-unpublished";

/**
 * Assembles the site content from the repository's markdown.
 *
 * @param args - The command-line arguments: nothing, or {@linkcode INCLUDE_UNPUBLISHED}
 * @returns The process exit code
 */
export async function main(args: readonly string[]): Promise<number> {
	const unknown = args.filter((arg) => arg !== INCLUDE_UNPUBLISHED);
	if (unknown.length > 0) {
		console.error(
			`docs:assemble: unknown argument ${unknown.join(" ")}; the only flag is ${INCLUDE_UNPUBLISHED}`,
		);
		return 2;
	}
	const includeUnpublished = args.includes(INCLUDE_UNPUBLISHED);

	const planned = planSite({
		rootReadme: await Deno.readTextFile(join(ROOT, "README.md")),
		packages: await readPackages(),
		includeUnpublished,
	});
	if (!planned.ok) {
		for (const error of planned.error) {
			console.error(`docs:assemble: ${describePageError(error)}`);
		}
		return 1;
	}
	const site = planned.value;

	const changes = diffContent({
		current: await readContentTree(CONTENT_DIR),
		desired: siteTree(site),
	});
	await applyChanges({ dir: CONTENT_DIR, changes });

	const preview = includeUnpublished ? ", previewing unpublished packages" : "";
	console.log(
		`assembled ${site.pages.length} pages into ${CONTENT_DIR}${preview} (wrote ${changes.write.length} files, removed ${changes.remove.length})`,
	);
	return 0;
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
