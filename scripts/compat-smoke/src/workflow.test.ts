import { assert } from "@std/assert";
import { TOOLS } from "@/src/plan.ts";

Deno.test("the smoke workflow installs Playwright's system libraries at the pinned version", async () => {
	// Given: the smoke workflow
	const workflow = await Deno.readTextFile(
		new URL("../../../.github/workflows/compat-smoke.yml", import.meta.url),
	);

	// When: its Playwright install-deps command is looked for
	const pinned = workflow.includes(
		`playwright@${TOOLS.playwright} install-deps`,
	);

	// Then: it uses the version a run installs
	assert(pinned, `compat-smoke.yml must use playwright@${TOOLS.playwright}`);
});
