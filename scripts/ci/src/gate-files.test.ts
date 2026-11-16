import { assertEquals } from "@std/assert";
import { gateFiles } from "@/src/gate-files.ts";

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

Deno.test("gateFiles gives Biome every file and deno check only code", () => {
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

	// Then: Biome sees them all (it skips unknown kinds itself); deno check
	// sees the TypeScript and JavaScript ones
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
});

Deno.test("gateFiles refuses an empty list instead of checking everything", () => {
	// Given: git lists nothing, only deleted files, or no code for deno check
	const cases = [
		{ tool: "biome", listed: "", deleted: "" },
		{ tool: "biome", listed: "gone.ts\0", deleted: "gone.ts\0" },
		{ tool: "check", listed: "README.md\0", deleted: "" },
	] as const;

	for (const input of cases) {
		// When: computing the tool's files
		const result = gateFiles(input);

		// Then: it is an error, since either tool given no paths walks the
		// whole tree, gitignored scratch included
		assertEquals(result.ok, false, JSON.stringify(input));
	}
});
