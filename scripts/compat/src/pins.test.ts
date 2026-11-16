import { assertEquals, assertMatch } from "@std/assert";
import { z } from "zod";
import { WORKERD_COMPATIBILITY_DATE } from "./runtime.ts";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const REPO_ROOT = new URL("../../../", import.meta.url);

const manifestSchema = z.object({ imports: z.record(z.string(), z.string()) });

/** The Playwright version `deno.json` pins, from `npm:playwright@<version>`. */
async function pinnedPlaywright(): Promise<string> {
	const { imports } = manifestSchema.parse(
		JSON.parse(await Deno.readTextFile(new URL("deno.json", PACKAGE_ROOT))),
	);
	const [, version] =
		/^npm:playwright@(.+)$/.exec(imports.playwright ?? "") ?? [];
	if (version === undefined) {
		throw new Error("scripts/compat/deno.json pins no npm:playwright");
	}
	return version;
}

/** Every distinct `playwright@<version>` a text names. */
function playwrightVersionsIn(text: string): Set<string> {
	return new Set(
		[...text.matchAll(/playwright@(\d+\.\d+\.\d+)/g)].map(
			([, version]) => version ?? "",
		),
	);
}

Deno.test("the compat workflow and README install the Playwright deno.json pins", async () => {
	// Given: the suite's Playwright pin, its workflow and its README
	const pin = await pinnedPlaywright();
	const workflow = await Deno.readTextFile(
		new URL(".github/workflows/compat.yml", REPO_ROOT),
	);
	const readme = await Deno.readTextFile(new URL("README.md", PACKAGE_ROOT));

	// When: the Playwright versions each installs are collected
	const inWorkflow = playwrightVersionsIn(workflow);
	const inReadme = playwrightVersionsIn(readme);

	// Then: each names exactly the pinned version, since every Playwright
	// release expects its own browser builds
	assertEquals(inWorkflow, new Set([pin]));
	assertEquals(inReadme, new Set([pin]));
});

Deno.test("the suite and the smoke run workerd under one compatibility date", async () => {
	// Given: the smoke layer's install plan
	const plan = await Deno.readTextFile(
		new URL("scripts/compat-smoke/src/plan.ts", REPO_ROOT),
	);

	// When: its compatibility date is read
	const [, smokeDate] =
		/WORKERD_COMPATIBILITY_DATE = "(\d{4}-\d{2}-\d{2})"/.exec(plan) ?? [];

	// Then: it is the suite's, a date the pinned Miniflare knows
	assertEquals(smokeDate, WORKERD_COMPATIBILITY_DATE);
	assertMatch(WORKERD_COMPATIBILITY_DATE, /^\d{4}-\d{2}-\d{2}$/);
});
