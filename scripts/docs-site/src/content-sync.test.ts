import { assertEquals } from "@std/assert";
import { diffContent, SITE_JSON, siteTree } from "./content-sync.ts";

Deno.test("diffContent writes every desired file into an empty tree", () => {
	// Given: nothing on disk and two desired files
	const current = new Map<string, string>();
	const desired = new Map([
		["vow/index.md", "# Vow"],
		["index.md", "# Sekhmet"],
	]);

	// When: diffing them
	const changes = diffContent({ current, desired });

	// Then: both files are written, sorted by path, and nothing is removed
	assertEquals(changes, {
		write: [
			{ path: "index.md", text: "# Sekhmet" },
			{ path: "vow/index.md", text: "# Vow" },
		],
		remove: [],
	});
});

Deno.test("diffContent changes nothing when the trees match", () => {
	// Given: a tree on disk identical to the desired one
	const desired = new Map([
		["index.md", "# Sekhmet"],
		[SITE_JSON, "{}"],
	]);
	const current = new Map(desired);

	// When: diffing them
	const changes = diffContent({ current, desired });

	// Then: there is nothing to write or remove
	assertEquals(changes, { write: [], remove: [] });
});

Deno.test("diffContent writes only the files whose text differs", () => {
	// Given: one unchanged file and one edited file
	const current = new Map([
		["index.md", "# Sekhmet"],
		["vow/recipes.md", "# Recipes\n\nold"],
	]);
	const desired = new Map([
		["index.md", "# Sekhmet"],
		["vow/recipes.md", "# Recipes\n\nnew"],
	]);

	// When: diffing them
	const changes = diffContent({ current, desired });

	// Then: only the edited file is written
	assertEquals(changes, {
		write: [{ path: "vow/recipes.md", text: "# Recipes\n\nnew" }],
		remove: [],
	});
});

Deno.test("diffContent removes files no longer desired", () => {
	// Given: a tree on disk holding a page the site no longer has
	const current = new Map([
		["index.md", "# Sekhmet"],
		["job/index.md", "# Job"],
		["job/concepts.md", "# Concepts"],
	]);
	const desired = new Map([["index.md", "# Sekhmet"]]);

	// When: diffing them
	const changes = diffContent({ current, desired });

	// Then: the stale pages are removed, sorted, and nothing is written
	assertEquals(changes, {
		write: [],
		remove: ["job/concepts.md", "job/index.md"],
	});
});

Deno.test("diffContent treats an emptied file as a change", () => {
	// Given: a file on disk whose desired text is empty
	const current = new Map([["index.md", "# Sekhmet"]]);
	const desired = new Map([["index.md", ""]]);

	// When: diffing them
	const changes = diffContent({ current, desired });

	// Then: the empty text is written rather than skipped
	assertEquals(changes, {
		write: [{ path: "index.md", text: "" }],
		remove: [],
	});
});

Deno.test("siteTree holds every page plus the navigation file", () => {
	// Given: a planned site with one page and its navigation
	const site = {
		pages: [{ path: "index.md", text: "# Sekhmet" }],
		sidebar: {},
		nav: [{ text: "Vow", link: "/vow/" }],
	};

	// When: turning it into a content tree
	const tree = siteTree(site);

	// Then: the page and site.json are both in it, the JSON tab-indented
	assertEquals(
		tree,
		new Map([
			["index.md", "# Sekhmet"],
			[SITE_JSON, JSON.stringify({ sidebar: {}, nav: site.nav }, null, "\t")],
		]),
	);
});
