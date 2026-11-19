// deno-coverage-ignore-file
/**
 * CLI that assembles the docs site's content: it reads the root README and
 * every package's `README.md` and `docs/*.md`, and writes the pages and the
 * navigation (`site.json`) into `scripts/docs-site/content/`, which
 * VitePress then builds. The content directory is generated and ignored by
 * git. A docs page with unreadable frontmatter or an unknown `kind` fails
 * the run, naming the file.
 *
 * Unpublished packages are left out unless the run is passed
 * {@linkcode INCLUDE_UNPUBLISHED}, which `deno task docs:dev` does to
 * preview them locally; `deno task docs:build`, and so the deployed site,
 * never does.
 *
 * @module
 */

import { emptyDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import {
	type DocFile,
	describePageError,
	type PackageSource,
	planSite,
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

	const preview = includeUnpublished ? ", previewing unpublished packages" : "";
	console.log(
		`assembled ${site.pages.length} pages into ${CONTENT_DIR}${preview}`,
	);
	return 0;
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
