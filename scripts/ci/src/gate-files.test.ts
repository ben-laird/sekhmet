import { assertEquals } from "@std/assert";
import { GATE_TOOLS, gateFiles, isGateTool } from "@/src/gate-files.ts";

Deno.test("gateFiles lists every file git lists, once, in order", () => {
	// Given: `git ls-files -z` output with a file listed twice (staged and modified)
	const listed = "b.ts\0a.ts\0b.ts\0";

	// When: computing Biome's files
	const result = gateFiles({ tool: "biome", listed, deleted: "" });

	// Then: each file appears once, sorted
	assertEquals(result, { ok: true, paths: ["a.ts", "b.ts"] });
});

Deno.test("gateFiles drops tracked files deleted from the working tree", () => {
	// Given: a tracked file that `git ls-files --deleted` reports as deleted
	const listed = "gone.ts\0kept.ts\0";
	const deleted = "gone.ts\0";

	// When: computing Biome's files
	const result = gateFiles({ tool: "biome", listed, deleted });

	// Then: the tool is never handed a path it cannot read
	assertEquals(result, { ok: true, paths: ["kept.ts"] });
});

Deno.test("gateFiles keeps paths with spaces and newlines intact", () => {
	// Given: NUL-separated output with names git would quote without `-z`
	const listed = "docs/a b.md\0odd\nname.ts\0";

	// When: computing Biome's files
	const result = gateFiles({ tool: "biome", listed, deleted: "" });

	// Then: each name comes through verbatim
	assertEquals(result, { ok: true, paths: ["docs/a b.md", "odd\nname.ts"] });
});

Deno.test("gateFiles gives Biome every file and deno check and lint only code", () => {
	// Given: code, docs and config files
	const listed = [
		"README.md",
		"deno.json",
		"a.ts",
		"b.tsx",
		"c.mts",
		"d.cts",
		"e.js",
		"f.jsx",
		"g.mjs",
		"h.cjs",
		"types.d.ts",
		"notebook.ipynb",
	].join("\0");

	// When: computing each tool's files
	const biome = gateFiles({ tool: "biome", listed, deleted: "" });
	const check = gateFiles({ tool: "check", listed, deleted: "" });
	const lint = gateFiles({ tool: "lint", listed, deleted: "" });

	// Then: Biome sees them all (it skips unknown kinds itself); deno check
	// and deno lint see the TypeScript and JavaScript ones
	assertEquals(biome.ok && biome.paths.length, 12);
	assertEquals(check, {
		ok: true,
		paths: [
			"a.ts",
			"b.tsx",
			"c.mts",
			"d.cts",
			"e.js",
			"f.jsx",
			"g.mjs",
			"h.cjs",
			"types.d.ts",
		],
	});
	assertEquals(lint, check);
});

Deno.test("gateFiles refuses an empty list instead of checking everything", () => {
	// Given: git lists nothing, only deleted files, or no code for deno check
	const cases = [
		{ tool: "biome", listed: "", deleted: "" },
		{ tool: "biome", listed: "gone.ts\0", deleted: "gone.ts\0" },
		{ tool: "check", listed: "README.md\0", deleted: "" },
		{ tool: "lint", listed: "README.md\0", deleted: "" },
		{ tool: "test", listed: "deno.json\0lib.ts\0", deleted: "" },
	] as const;

	for (const input of cases) {
		// When: computing the tool's files
		const result = gateFiles(input);

		// Then: it is an error, since any tool given no paths walks the
		// whole tree, gitignored scratch included
		assertEquals(result.ok, false, JSON.stringify(input));
	}
});

Deno.test("gateFiles hands deno test the top-level directories git lists", () => {
	// Given: tracked files nested in top-level directories, one of them dotted
	const listed = [
		"packages/enum/mod.ts",
		"packages/enum/mod.test.ts",
		"scripts/ci/main.ts",
		".github/workflows/ci.yml",
	].join("\0");

	// When: computing deno test's paths
	const result = gateFiles({ tool: "test", listed, deleted: "" });

	// Then: each top-level directory appears once, so deno test walks it with
	// its own discovery and never runs a non-test module as a test
	assertEquals(result, { ok: true, paths: [".github", "packages", "scripts"] });
});

Deno.test("gateFiles hands deno test only the root files its walk would test", () => {
	// Given: root-level markdown, test modules, a plain module and config
	const listed = [
		"README.md",
		"NOTES.markdown",
		"smoke.test.ts",
		"smoke_test.js",
		"test.mjs",
		"contest.ts",
		"build.ts",
		"deno.json",
		"LICENSE",
	].join("\0");

	// When: computing deno test's paths
	const result = gateFiles({ tool: "test", listed, deleted: "" });

	// Then: markdown (doc-tested) and test modules go through; a plain module
	// would run as a test module if named, so it stays out like the config
	assertEquals(result, {
		ok: true,
		paths: [
			"NOTES.markdown",
			"README.md",
			"smoke.test.ts",
			"smoke_test.js",
			"test.mjs",
		],
	});
});

Deno.test("gateFiles leaves gitignored scratch out of every tool's paths", () => {
	// Given: git's listing, which never names the gitignored playground/
	const listed = ["packages/enum/mod.ts", "README.md"].join("\0");

	for (const tool of GATE_TOOLS) {
		// When: computing the tool's paths
		const result = gateFiles({ tool, listed, deleted: "" });

		// Then: no path is or contains playground/, so no tool walks it
		assertEquals(
			result.ok && result.paths.some((path) => path.startsWith("playground")),
			false,
			tool,
		);
	}
});

Deno.test("isGateTool accepts exactly the gate tools", () => {
	// Given: each tool name, and arguments that are not one
	const others = ["fmt", "", 1, undefined, "Biome"];

	// When: checking each
	const tools = GATE_TOOLS.map((tool) => isGateTool(tool));
	const rest = others.map((other) => isGateTool(other));

	// Then: only the tool names pass
	assertEquals(tools, [true, true, true, true]);
	assertEquals(rest, [false, false, false, false, false]);
});
