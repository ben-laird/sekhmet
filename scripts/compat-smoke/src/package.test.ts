import { isOk } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import {
	exportPaths,
	isPackageName,
	npmName,
	type PackageName,
	parsePackageName,
} from "@/src/package.ts";

function name(text: string): PackageName {
	if (!isPackageName(text)) throw new Error(`bad fixture: ${text}`);
	return text;
}

Deno.test("parsePackageName accepts @scope/name and rejects anything else", () => {
	// Given: a valid name and some invalid ones
	const candidates = [
		"@sekhmet/enum",
		"sekhmet/enum",
		"@sekhmet",
		"@Sekhmet/enum",
		"@sekhmet/enum/core",
	];

	// When: each is parsed
	const parsed = candidates.map((candidate) =>
		isOk(parsePackageName(candidate)),
	);

	// Then: only the scoped name is accepted
	assertEquals(parsed, [true, false, false, false, false]);
});

Deno.test("npmName maps a JSR name to JSR's npm registry name", () => {
	// Given: JSR package names
	const names = [name("@sekhmet/enum"), name("@sekhmet/compat-smoke")];

	// When: each is mapped
	const mapped = names.map(npmName);

	// Then: they live under @jsr with the scope folded in
	assertEquals(mapped, ["@jsr/sekhmet__enum", "@jsr/sekhmet__compat-smoke"]);
});

Deno.test("exportPaths lists every export-map key as a bare specifier", async (t) => {
	await t.step("the root export is the package name itself", () => {
		// Given: a package with a root export and subpaths
		const pkg = {
			name: name("@sekhmet/vow"),
			version: "0.1.0",
			exports: {
				".": "./mod.ts",
				"./mini": "./src/mini/mod.ts",
				"./mini/core": "./src/mini/core.ts",
			},
		};

		// When: its export paths are listed
		const paths = exportPaths(pkg);

		// Then: one specifier per key, in export-map order
		assertEquals(paths, [
			{ package: "@sekhmet/vow", specifier: "@sekhmet/vow" },
			{ package: "@sekhmet/vow", specifier: "@sekhmet/vow/mini" },
			{ package: "@sekhmet/vow", specifier: "@sekhmet/vow/mini/core" },
		]);
	});

	await t.step("a package without a root export has only subpaths", () => {
		// Given: a package with subpath exports only
		const pkg = {
			name: name("@sekhmet/primordials"),
			version: "0.1.0",
			exports: { "./struct": "./struct.ts", "./scoping": "./scoping.ts" },
		};

		// When: its export paths are listed
		const specifiers = exportPaths(pkg).map((path) => path.specifier);

		// Then: no bare package specifier appears
		assertEquals(specifiers, [
			"@sekhmet/primordials/struct",
			"@sekhmet/primordials/scoping",
		]);
	});
});
