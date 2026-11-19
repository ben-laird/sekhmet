/**
 * Brings the content directory up to date with a planned site by changing
 * only what differs, so a re-run under `vitepress dev` touches no file whose
 * text is unchanged and the dev server sees no burst of file events.
 *
 * @module
 */

import type { Site } from "./assemble.ts";

/**
 * A content tree: each file's text, keyed by its `/`-separated path relative
 * to the content directory, e.g. `enum/index.md`.
 */
export type ContentTree = ReadonlyMap<string, string>;

/** The navigation file the VitePress config reads, beside the pages. */
export const SITE_JSON = "site.json";

/** The changes that turn the tree on disk into the desired one. */
export interface ContentChanges {
	/** Files to write, new or with different text, sorted by path. */
	readonly write: readonly { readonly path: string; readonly text: string }[];
	/** Paths on disk that are no longer desired, sorted. */
	readonly remove: readonly string[];
}

/**
 * The content tree a planned site writes: its pages plus {@linkcode SITE_JSON}.
 *
 * @param site - The planned site
 * @returns Every file's text by path
 */
export function siteTree(site: Site): ContentTree {
	const tree = new Map<string, string>(
		site.pages.map((page) => [page.path, page.text]),
	);
	tree.set(
		SITE_JSON,
		JSON.stringify({ sidebar: site.sidebar, nav: site.nav }, null, "\t"),
	);
	return tree;
}

/**
 * Diffs the tree on disk against the desired one.
 *
 * @param trees - The tree on disk (`current`) and the tree to end with (`desired`)
 * @returns The files to write and the paths to remove; both empty when the trees match
 */
export function diffContent({
	current,
	desired,
}: {
	readonly current: ContentTree;
	readonly desired: ContentTree;
}): ContentChanges {
	const write = [...desired.keys()].sort().flatMap((path) => {
		const text = desired.get(path);
		if (text === undefined || current.get(path) === text) return [];
		return [{ path, text }];
	});
	const remove = [...current.keys()].filter((path) => !desired.has(path));
	return { write, remove: remove.sort() };
}
