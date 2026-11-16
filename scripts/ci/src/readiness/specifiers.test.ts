import { assertEquals } from "@std/assert";
import { checkSpecifiers, parseSekhmetSpecifier } from "./specifiers.ts";
import type { Member } from "./workspace.ts";

const ENUM: Member = {
	dir: "packages/enum",
	manifestPath: "packages/enum/deno.json",
	manifestText: "{}",
	manifest: {
		name: "@sekhmet/enum",
		publish: true,
		publishExclude: [],
		exports: { "./core": "./core.ts", "./core/mini": "./mini.ts" },
		workspace: [],
	},
};
const PACKAGES = new Map([["@sekhmet/enum", ENUM]]);

Deno.test("parseSekhmetSpecifier splits package and export, dropping jsr versions", () => {
	// Given: a bare package, a subpath and a versioned subpath
	const specifiers = [
		"@sekhmet/enum",
		"@sekhmet/enum/core/mini",
		"@sekhmet/enum@0.1.0/core",
	];

	// When: parsing each
	const parsed = specifiers.map(parseSekhmetSpecifier);

	// Then: each names the package and its export key
	assertEquals(parsed, [
		{ packageName: "@sekhmet/enum", exportKey: "." },
		{ packageName: "@sekhmet/enum", exportKey: "./core/mini" },
		{ packageName: "@sekhmet/enum", exportKey: "./core" },
	]);
});

Deno.test("checkSpecifiers passes real exports and reports unknown exports and packages", () => {
	// Given: a README with a good import, a bad export and an unknown package
	const text = [
		"```ts",
		'import { isolate } from "@sekhmet/enum/core/mini";',
		'import { nope } from "jsr:@sekhmet/enum/nope";',
		'import {} from "@sekhmet/framework/entrypoint";',
		"```",
	].join("\n");

	// When: checking its specifiers
	const findings = checkSpecifiers({
		path: "packages/enum/README.md",
		text,
		packages: PACKAGES,
	});

	// Then: the two bad ones are reported on their lines
	assertEquals(
		findings.map(({ line, message }) => `${line}: ${message}`),
		[
			'3: "@sekhmet/enum/nope" is not an export of @sekhmet/enum; its exports are listed in packages/enum/deno.json',
			'4: "@sekhmet/framework/entrypoint" names @sekhmet/framework, which is not a workspace package',
		],
	);
});
