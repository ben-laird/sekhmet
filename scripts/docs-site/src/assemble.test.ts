import { assert, assertEquals } from "@std/assert";
import {
	apiReferenceLink,
	describePageError,
	docLinks,
	planSite,
	readmeLinks,
	rootLinks,
	titleOf,
} from "./assemble.ts";

Deno.test("titleOf reads the first level-one heading", () => {
	// Given: markdown with a level-two heading before the level-one heading
	const text = "## Aside\n\n# Getting started\n\nBody";

	// When: reading its title
	const title = titleOf({ text, fallback: "page" });

	// Then: the level-one heading wins
	assertEquals(title, "Getting started");
});

Deno.test("titleOf falls back when there is no heading", () => {
	// Given: markdown without a level-one heading
	const text = "Just text";

	// When: reading its title
	const title = titleOf({ text, fallback: "page" });

	// Then: the fallback is used
	assertEquals(title, "page");
});

Deno.test("readmeLinks points docs/ links at sibling pages", () => {
	// Given: a README linking into docs/ both ways, plus an external link
	const text =
		"[a](docs/concepts.md) [b](./docs/recipes.md#x) [c](https://jsr.io/@sekhmet/enum)";

	// When: rewriting it for the site
	const rewritten = readmeLinks(text);

	// Then: docs links become siblings and the external link is untouched
	assertEquals(
		rewritten,
		"[a](./concepts.md) [b](./recipes.md#x) [c](https://jsr.io/@sekhmet/enum)",
	);
});

Deno.test("docLinks points the README link at the overview page", () => {
	// Given: a doc page linking back to its README and to a sibling
	const text = "[home](../README.md) [next](./recipes.md)";

	// When: rewriting it for the site
	const rewritten = docLinks(text);

	// Then: the README becomes the overview page
	assertEquals(rewritten, "[home](./index.md) [next](./recipes.md)");
});

Deno.test("rootLinks points package links at package sections", () => {
	// Given: the root README linking to a package, its README and a guide
	const text =
		"[a](packages/enum) [b](./packages/effect/README.md) [c](packages/enum/docs/concepts.md)";

	// When: rewriting it for the site
	const rewritten = rootLinks({ text, unpublished: new Set() });

	// Then: each link points into the package's section
	assertEquals(rewritten, "[a](/enum/) [b](/effect/) [c](/enum/concepts)");
});

Deno.test("rootLinks points other relative links at the repository", () => {
	// Given: root-file links, an absolute URL and an in-page anchor
	const text =
		"[l](LICENSE.md) [c](./CONTRIBUTING.md) [j](https://jsr.io/@sekhmet) [a](#packages)";

	// When: rewriting it for the site
	const rewritten = rootLinks({ text, unpublished: new Set() });

	// Then: only the relative file links change, to the repository's files
	assertEquals(
		rewritten,
		"[l](https://github.com/ben-laird/sekhmet/blob/main/LICENSE.md) [c](https://github.com/ben-laird/sekhmet/blob/main/CONTRIBUTING.md) [j](https://jsr.io/@sekhmet) [a](#packages)",
	);
});

Deno.test("apiReferenceLink points at the package's API docs on JSR", () => {
	// Given: a package directory
	const dir = "enum";

	// When: linking its API reference
	const link = apiReferenceLink(dir);

	// Then: it is JSR's docs page, generated from the package's TSDoc
	assertEquals(link, {
		text: "API on JSR",
		link: "https://jsr.io/@sekhmet/enum/doc",
	});
});

Deno.test("planSite groups a package's pages by Diátaxis kind", () => {
	// Given: tagged pages of every kind but reference, out of order, and a package with nothing
	const packages = [
		{
			dir: "enum",
			readme: "# Enum\n\nSee [concepts](docs/concepts.md).",
			docs: [
				{ name: "recipes.md", text: "---\nkind: how-to\n---\n# Recipes" },
				{
					name: "concepts.md",
					text: "---\nkind: explanation\n---\n# Concepts",
				},
				{ name: "migrate.md", text: "---\nkind: how-to\n---\n# Migrating" },
				{
					name: "getting-started.md",
					text: "---\nkind: tutorial\n---\n# Getting started",
				},
			],
			published: true,
		},
		{ dir: "empty", readme: undefined, docs: [], published: true },
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(planned.ok);
	const site = planned.value;

	// Then: every page is written, frontmatter kept for VitePress, and the empty package is left out
	assertEquals(
		site.pages.map((page) => page.path),
		[
			"index.md",
			"enum/index.md",
			"enum/concepts.md",
			"enum/getting-started.md",
			"enum/migrate.md",
			"enum/recipes.md",
		],
	);
	assertEquals(site.pages[1]?.text, "# Enum\n\nSee [concepts](./concepts.md).");
	assertEquals(site.pages[2]?.text, "---\nkind: explanation\n---\n# Concepts");

	// Then: the overview leads, then a sub-group per kind in Diátaxis order, titled by each page's heading
	assertEquals(site.sidebar, {
		"/enum/": [
			{
				text: "@sekhmet/enum",
				items: [
					{ text: "Overview", link: "/enum/" },
					{
						text: "Tutorials",
						items: [{ text: "Getting started", link: "/enum/getting-started" }],
					},
					{
						text: "How-to guides",
						items: [
							{ text: "Migrating", link: "/enum/migrate" },
							{ text: "Recipes", link: "/enum/recipes" },
						],
					},
					{
						text: "Explanation",
						items: [{ text: "Concepts", link: "/enum/concepts" }],
					},
					{ text: "Reference", items: [apiReferenceLink("enum")] },
				],
			},
		],
	});
	assertEquals(site.nav, [{ text: "enum", link: "/enum/" }]);
});

Deno.test("planSite leads each group with getting-started, then sorts by title", () => {
	// Given: three how-to pages, getting-started's title sorting last
	const packages = [
		{
			dir: "vow",
			readme: "# Vow",
			docs: [
				{ name: "b.md", text: "---\nkind: how-to\n---\n# Alpha" },
				{
					name: "getting-started.md",
					text: "---\nkind: how-to\n---\n# Zebra start",
				},
				{ name: "a.md", text: "---\nkind: how-to\n---\n# Beta" },
			],
			published: true,
		},
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(planned.ok);
	const site = planned.value;

	// Then: getting-started leads, then the rest by title, not file name
	assertEquals(site.sidebar["/vow/"]?.[0]?.items[1], {
		text: "How-to guides",
		items: [
			{ text: "Zebra start", link: "/vow/getting-started" },
			{ text: "Alpha", link: "/vow/b" },
			{ text: "Beta", link: "/vow/a" },
		],
	});
});

Deno.test("planSite lists untagged pages after the overview, before the kind groups", () => {
	// Given: an untagged page, a local reference page and a tutorial
	const packages = [
		{
			dir: "schema",
			readme: "# Schema",
			docs: [
				{ name: "design.md", text: "# Schema design" },
				{ name: "issues.md", text: "---\nkind: reference\n---\n# Issues" },
				{
					name: "getting-started.md",
					text: "---\nkind: tutorial\n---\n# Getting started",
				},
			],
			published: true,
		},
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(planned.ok);
	const site = planned.value;

	// Then: the untagged page stays listed, and Reference leads with the JSR API
	assertEquals(site.sidebar["/schema/"]?.[0]?.items, [
		{ text: "Overview", link: "/schema/" },
		{ text: "Schema design", link: "/schema/design" },
		{
			text: "Tutorials",
			items: [{ text: "Getting started", link: "/schema/getting-started" }],
		},
		{
			text: "Reference",
			items: [
				apiReferenceLink("schema"),
				{ text: "Issues", link: "/schema/issues" },
			],
		},
	]);
});

Deno.test("planSite rejects every page with an invalid kind, naming its file", () => {
	// Given: one page with an unknown kind and one with an unclosed block
	const packages = [
		{
			dir: "enum",
			readme: "# Enum",
			docs: [
				{ name: "recipes.md", text: "---\nkind: recipe\n---\n# Recipes" },
				{ name: "concepts.md", text: "---\nkind: explanation\n# Concepts" },
			],
			published: true,
		},
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(!planned.ok);
	const errors = planned.error;

	// Then: both pages are reported with their repository paths
	assertEquals(errors.map(describePageError), [
		"packages/enum/docs/concepts.md: frontmatter has no closing `---` line",
		'packages/enum/docs/recipes.md: unknown kind "recipe"; expected one of tutorial, how-to, explanation, reference',
	]);
});

Deno.test("planSite gives a docs-only package a placeholder overview", () => {
	// Given: a package with guides but no README
	const packages = [
		{
			dir: "panic",
			readme: undefined,
			docs: [{ name: "concepts.md", text: "# Concepts" }],
			published: true,
		},
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(planned.ok);
	const site = planned.value;

	// Then: the overview page exists so the section has a landing page
	assertEquals(
		site.pages.find((page) => page.path === "panic/index.md")?.text,
		"# @sekhmet/panic\n\nThis package has no README yet.\n",
	);
});

Deno.test("planSite leaves out unpublished packages", () => {
	// Given: a published package and a prototype marked "publish": false
	const packages = [
		{ dir: "enum", readme: "# Enum", docs: [], published: true },
		{
			dir: "job",
			readme: "# Job",
			docs: [{ name: "guide.md", text: "---\nkind: how-to\n---\n# Guide" }],
			published: false,
		},
	];

	// When: planning the site
	const planned = planSite({ rootReadme: "# Sekhmet", packages });
	assert(planned.ok);

	// Then: the prototype has no pages, no nav entry and no dead JSR link
	assertEquals(
		planned.value.pages.map((page) => page.path),
		["index.md", "enum/index.md"],
	);
	assertEquals(
		planned.value.nav.map((link) => link.text),
		["enum"],
	);
	assertEquals(Object.keys(planned.value.sidebar), ["/enum/"]);
});

Deno.test("rootLinks points links into unpublished packages at the repository", () => {
	// Given: the root README linking a published package and an unpublished one
	const text =
		"[e](packages/enum/README.md) [j](packages/job/README.md) [g](./packages/job/docs/guide.md)";

	// When: rewriting it with job unpublished
	const rewritten = rootLinks({ text, unpublished: new Set(["job"]) });

	// Then: the published package gets its section; job's links go to GitHub
	assertEquals(
		rewritten,
		"[e](/enum/) [j](https://github.com/ben-laird/sekhmet/blob/main/packages/job/README.md) [g](https://github.com/ben-laird/sekhmet/blob/main/packages/job/docs/guide.md)",
	);
});

Deno.test("planSite's home page links an unpublished package to the repository", () => {
	// Given: a root README that links the unpublished job package
	const packages = [
		{ dir: "enum", readme: "# Enum", docs: [], published: true },
		{ dir: "job", readme: "# Job", docs: [], published: false },
	];
	const rootReadme =
		"See [job](packages/job/README.md) and [enum](packages/enum/README.md).";

	// When: planning the site
	const planned = planSite({ rootReadme, packages });
	assert(planned.ok);

	// Then: the home page has no route to the missing /job/ section
	const home = planned.value.pages.find((page) => page.path === "index.md");
	assertEquals(
		home?.text,
		"See [job](https://github.com/ben-laird/sekhmet/blob/main/packages/job/README.md) and [enum](/enum/).",
	);
});
