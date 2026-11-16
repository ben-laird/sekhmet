// deno-coverage-ignore-file
/**
 * CLI that assembles the docs site's content: it reads the root README and
 * every package's `README.md` and `docs/*.md`, and writes the pages and the
 * navigation (`site.json`) into `scripts/docs-site/content/`, which
 * VitePress then builds. The content directory is generated and ignored by
 * git.
 *
 * @module
 */

import { emptyDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { type DocFile, type PackageSource, planSite } from "@/mod.ts";

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

async function readPackages(): Promise<PackageSource[]> {
	const packages: PackageSource[] = [];
	for await (const entry of Deno.readDir(PACKAGES)) {
		if (!entry.isDirectory) continue;
		const dir = join(PACKAGES, entry.name);
		packages.push({
			dir: entry.name,
			readme: await readIfExists(join(dir, "README.md")),
			docs: await readDocs(join(dir, "docs")),
		});
	}
	return packages;
}

/**
 * Assembles the site content from the repository's markdown.
 *
 * @returns The process exit code
 */
export async function main(): Promise<number> {
	const site = planSite({
		rootReadme: await Deno.readTextFile(join(ROOT, "README.md")),
		packages: await readPackages(),
	});

	await emptyDir(CONTENT_DIR);
	for (const page of site.pages) {
		const path = join(CONTENT_DIR, page.path);
		await Deno.mkdir(dirname(path), { recursive: true });
		await Deno.writeTextFile(path, page.text);
	}
	await Deno.writeTextFile(
		join(CONTENT_DIR, "site.json"),
		JSON.stringify({ sidebar: site.sidebar, nav: site.nav }, null, "\t"),
	);

	console.log(`assembled ${site.pages.length} pages into ${CONTENT_DIR}`);
	return 0;
}

if (import.meta.main) {
	Deno.exit(await main());
}
