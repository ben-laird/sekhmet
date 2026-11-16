import { assertEquals } from "@std/assert";
import { packageNameOf, withVersion } from "./specifier.ts";

Deno.test("packageNameOf extracts the scoped name from any specifier form", () => {
	// Given: bare, subpath, jsr, npm and non-package specifiers
	const cases: [string, string | undefined][] = [
		["@sekhmet/enum", "@sekhmet/enum"],
		["@sekhmet/enum/result/mini", "@sekhmet/enum"],
		["jsr:@sekhmet/enum@^0.1.0", "@sekhmet/enum"],
		["jsr:/@sekhmet/enum@^0.1.0/result", "@sekhmet/enum"],
		["npm:@biomejs/biome@^2", "@biomejs/biome"],
		["./mod.ts", undefined],
		["@/src/core.ts", undefined],
		["https://example.com/x.ts", undefined],
	];

	for (const [specifier, expected] of cases) {
		// When: extracting the package name
		const name = packageNameOf(specifier);

		// Then: it matches the expected package
		assertEquals(name, expected, specifier);
	}
});

Deno.test("withVersion keeps the prefix, range operator and subpath", () => {
	// Given: specifiers with caret, tilde, exact and subpath forms
	const cases: [string, string][] = [
		["jsr:@sekhmet/enum@^0.1.0", "jsr:@sekhmet/enum@^0.2.0"],
		["jsr:@sekhmet/enum@~0.1.0", "jsr:@sekhmet/enum@~0.2.0"],
		["jsr:@sekhmet/enum@0.1.0", "jsr:@sekhmet/enum@0.2.0"],
		["jsr:/@sekhmet/enum@^0.1.0/", "jsr:/@sekhmet/enum@^0.2.0/"],
	];

	for (const [specifier, expected] of cases) {
		// When: pointing it at 0.2.0
		const rewritten = withVersion({ specifier, version: "0.2.0" });

		// Then: only the version moved
		assertEquals(rewritten, expected, specifier);
	}
});

Deno.test("withVersion leaves unversioned specifiers alone", () => {
	// Given: a bare workspace specifier with no version
	const specifier = "@sekhmet/enum";

	// When: pointing it at a new version
	const rewritten = withVersion({ specifier, version: "0.2.0" });

	// Then: it is unchanged
	assertEquals(rewritten, specifier);
});
