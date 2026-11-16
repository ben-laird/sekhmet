import { assertEquals } from "@std/assert";
import {
	decodeManifest,
	discoverNamespaces,
	type PackageManifest,
} from "@/src/discover.ts";

const ENUM: PackageManifest = {
	name: "@sekhmet/enum",
	exports: {
		"./option": "./src/option/main/mod.ts",
		"./option/mini": "./src/option/mini/mod.ts",
		"./option/mini/core": "./src/option/mini/core.ts",
		"./result": "./src/result/main/mod.ts",
		"./result/mini": "./src/result/mini/mod.ts",
	},
};

Deno.test("discoverNamespaces", async (t) => {
	await t.step("a package without a root exposes each main feature", () => {
		// Given: a package with only feature subpaths and their mini entrypoints
		const manifests = [ENUM];

		// When: discovering namespaces
		const namespaces = discoverNamespaces(manifests);

		// Then: each feature is a namespace named after its subpath; minis are skipped
		assertEquals(namespaces, [
			{ name: "option", specifier: "@sekhmet/enum/option" },
			{ name: "result", specifier: "@sekhmet/enum/result" },
		]);
	});

	await t.step("a package with a root exposes only the root", () => {
		// Given: a package whose root re-exports its features
		const manifests: PackageManifest[] = [
			{
				name: "@sekhmet/effect",
				exports: {
					".": "./mod.ts",
					"./effect": "./src/effect/main/mod.ts",
					"./fiber": "./src/fiber/main/mod.ts",
					"./fiber/mini": "./src/fiber/mini/mod.ts",
				},
			},
		];

		// When: discovering namespaces
		const namespaces = discoverNamespaces(manifests);

		// Then: one namespace, named after the package
		assertEquals(namespaces, [
			{ name: "effect", specifier: "@sekhmet/effect" },
		]);
	});

	await t.step("colliding names are qualified by package", () => {
		// Given: two packages that both export a `core` feature
		const manifests: PackageManifest[] = [
			{ name: "@sekhmet/enum", exports: { "./core": "./a.ts" } },
			{ name: "@sekhmet/graph", exports: { "./core": "./b.ts" } },
			{ name: "@sekhmet/tidy", exports: { "./option": "./c.ts" } },
		];

		// When: discovering namespaces
		const namespaces = discoverNamespaces(manifests);

		// Then: the colliding pair is qualified; the unique name stays bare
		assertEquals(namespaces, [
			{ name: "enumCore", specifier: "@sekhmet/enum/core" },
			{ name: "graphCore", specifier: "@sekhmet/graph/core" },
			{ name: "option", specifier: "@sekhmet/tidy/option" },
		]);
	});

	await t.step("kebab-case and reserved names become identifiers", () => {
		// Given: a feature subpath in kebab-case and one that is a keyword
		const manifests: PackageManifest[] = [
			{
				name: "@sekhmet/misc",
				exports: { "./fiber-error": "./a.ts", "./default": "./b.ts" },
			},
		];

		// When: discovering namespaces
		const namespaces = discoverNamespaces(manifests);

		// Then: kebab-case is camelCased and the keyword is qualified
		assertEquals(namespaces, [
			{ name: "miscDefault", specifier: "@sekhmet/misc/default" },
			{ name: "fiberError", specifier: "@sekhmet/misc/fiber-error" },
		]);
	});

	await t.step("no manifests means no namespaces", () => {
		// Given: an empty workspace
		// When: discovering namespaces
		const namespaces = discoverNamespaces([]);

		// Then: nothing is exposed
		assertEquals(namespaces, []);
	});
});

Deno.test("decodeManifest", async (t) => {
	await t.step("reads the name and an exports map", () => {
		// Given: a parsed deno.json with a name and an exports map
		const json = {
			name: "@sekhmet/vow",
			version: "0.1.0",
			exports: { ".": "./mod.ts" },
		};

		// When: decoding it
		const decoded = decodeManifest(json);

		// Then: the manifest carries the name and exports
		assertEquals(decoded, {
			ok: true,
			value: { name: "@sekhmet/vow", exports: { ".": "./mod.ts" } },
		});
	});

	await t.step("treats a string export as the root", () => {
		// Given: a deno.json whose exports is a single path
		const json = { name: "@sekhmet/one", exports: "./mod.ts" };

		// When: decoding it
		const decoded = decodeManifest(json);

		// Then: the path becomes the root export
		assertEquals(decoded, {
			ok: true,
			value: { name: "@sekhmet/one", exports: { ".": "./mod.ts" } },
		});
	});

	await t.step("rejects a manifest without a name or exports", () => {
		// Given: deno.json contents that are not a package
		const inputs: unknown[] = [
			null,
			{ exports: { ".": "./mod.ts" } },
			{ name: "@sekhmet/x" },
			{ name: "@sekhmet/x", exports: { ".": 1 } },
		];

		// When: decoding each
		const decoded = inputs.map(decodeManifest);

		// Then: every one is an error
		assertEquals(
			decoded.map((result) => result.ok),
			[false, false, false, false],
		);
	});
});
