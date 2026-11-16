import { assertEquals } from "@std/assert";
import {
	lineOfKey,
	memberPath,
	memberRoots,
	membersUnder,
	parseManifest,
} from "./workspace.ts";

Deno.test("parseManifest reads name, license, publish, exports and workspace", () => {
	// Given: a manifest with every field the checks read
	const text = JSON.stringify({
		name: "@sekhmet/a",
		license: "MIT",
		publish: { exclude: ["**/*.test.ts"] },
		exports: { ".": "./mod.ts" },
		workspace: ["./packages/*"],
	});

	// When: parsing it
	const parsed = parseManifest({ path: "deno.json", text });

	// Then: each field is read
	assertEquals(parsed, {
		ok: true,
		value: {
			name: "@sekhmet/a",
			license: "MIT",
			publish: true,
			publishExclude: ["**/*.test.ts"],
			exports: { ".": "./mod.ts" },
			workspace: ["./packages/*"],
		},
	});
});

Deno.test("parseManifest treats a string export as the root export and publish: false as unpublished", () => {
	// Given: an unpublished manifest with a single string export
	const text = JSON.stringify({ publish: false, exports: "./mod.ts" });

	// When: parsing it
	const parsed = parseManifest({ path: "deno.json", text });

	// Then: the export is "." and the package is not published
	assertEquals(parsed.ok && parsed.value.exports, { ".": "./mod.ts" });
	assertEquals(parsed.ok && parsed.value.publish, false);
});

Deno.test("parseManifest reports invalid JSON as a finding instead of throwing", () => {
	// Given: a truncated manifest
	const text = '{ "name": ';

	// When: parsing it
	const parsed = parseManifest({ path: "packages/a/deno.json", text });

	// Then: the error is a finding on that file
	assertEquals(parsed.ok, false);
	assertEquals(!parsed.ok && parsed.error.file, "packages/a/deno.json");
});

Deno.test("membersUnder finds manifests directly inside the member roots", () => {
	// Given: members at two roots, a nested manifest and an unrelated one
	const files = new Map([
		["packages/a/deno.json", "{}"],
		["scripts/add/templates/lib/deno.json", "{}"],
		["packages/a/fixtures/x/deno.json", "{}"],
		["other/b/deno.json", "{}"],
	]);

	// When: listing members under packages and the templates directory
	const { members } = membersUnder({
		files,
		roots: ["packages", "scripts/add/templates"],
	});

	// Then: only the direct children of those roots are members
	assertEquals(
		members.map(({ dir }) => dir),
		["packages/a", "scripts/add/templates/lib"],
	);
});

Deno.test("memberRoots reads member directories from workspace globs", () => {
	// Given: a root manifest's workspace globs
	const parsed = parseManifest({
		path: "deno.json",
		text: JSON.stringify({ workspace: ["./packages/*", "./scripts/*"] }),
	});

	// When: reading the member roots
	const roots = parsed.ok ? memberRoots(parsed.value) : [];

	// Then: each glob gives its directory
	assertEquals(roots, ["packages", "scripts"]);
});

Deno.test("memberPath and lineOfKey locate files and manifest keys", () => {
	// Given: a member and its manifest text
	const manifestText = '{\n\t"name": "@sekhmet/a",\n\t"license": "MIT"\n}';
	const member = {
		dir: "packages/a",
		manifestPath: "packages/a/deno.json",
		manifestText,
		manifest: {
			publish: true,
			publishExclude: [],
			exports: {},
			workspace: [],
		},
	};

	// When: resolving an export target and finding the license key
	const path = memberPath({ member, path: "./src/../mod.ts" });
	const line = lineOfKey({ text: manifestText, key: "license" });

	// Then: the path is repo-relative and the key is on line 3
	assertEquals(path, "packages/a/mod.ts");
	assertEquals(line, 3);
});
