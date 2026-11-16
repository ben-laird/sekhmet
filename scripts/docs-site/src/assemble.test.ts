import { assertEquals } from "@std/assert";
import {
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
	const rewritten = rootLinks(text);

	// Then: each link points into the package's section
	assertEquals(rewritten, "[a](/enum/) [b](/effect/) [c](/enum/concepts)");
});

Deno.test("planSite builds a section per package with guides in order", () => {
	// Given: a package with a README and three guides, and one with nothing
	const packages = [
		{
			dir: "enum",
			readme: "# Enum\n\nSee [concepts](docs/concepts.md).",
			docs: [
				{ name: "recipes.md", text: "# Recipes" },
				{ name: "aaa-extra.md", text: "# Extra" },
				{ name: "concepts.md", text: "# Concepts" },
				{ name: "getting-started.md", text: "# Getting started" },
			],
		},
		{ dir: "empty", readme: undefined, docs: [] },
	];

	// When: planning the site
	const site = planSite({ rootReadme: "# Sekhmet", packages });

	// Then: the home page and the package pages are written, the empty package is left out
	assertEquals(
		site.pages.map((page) => page.path),
		[
			"index.md",
			"enum/index.md",
			"enum/getting-started.md",
			"enum/concepts.md",
			"enum/recipes.md",
			"enum/aaa-extra.md",
		],
	);
	assertEquals(site.pages[1]?.text, "# Enum\n\nSee [concepts](./concepts.md).");

	// Then: the sidebar leads with the overview and the standard guides
	assertEquals(site.sidebar, {
		"/enum/": [
			{
				text: "@sekhmet/enum",
				items: [
					{ text: "Overview", link: "/enum/" },
					{ text: "Getting started", link: "/enum/getting-started" },
					{ text: "Concepts", link: "/enum/concepts" },
					{ text: "Recipes", link: "/enum/recipes" },
					{ text: "Extra", link: "/enum/aaa-extra" },
				],
			},
		],
	});
	assertEquals(site.nav, [{ text: "enum", link: "/enum/" }]);
});

Deno.test("planSite gives a docs-only package a placeholder overview", () => {
	// Given: a package with guides but no README
	const packages = [
		{
			dir: "panic",
			readme: undefined,
			docs: [{ name: "concepts.md", text: "# Concepts" }],
		},
	];

	// When: planning the site
	const site = planSite({ rootReadme: "# Sekhmet", packages });

	// Then: the overview page exists so the section has a landing page
	assertEquals(
		site.pages.find((page) => page.path === "panic/index.md")?.text,
		"# @sekhmet/panic\n\nThis package has no README yet.\n",
	);
});
