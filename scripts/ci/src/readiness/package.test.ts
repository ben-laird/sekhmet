import { assertEquals } from "@std/assert";
import {
	checkExports,
	checkPackageFiles,
	checkPublishExclude,
} from "./package.ts";
import { type Member, parseManifest } from "./workspace.ts";

const MIT = "MIT License\n\nCopyright (c) 2026\n";

function member(manifest: Record<string, unknown>): Member {
	const manifestText = JSON.stringify(manifest, null, "\t");
	const parsed = parseManifest({
		path: "packages/a/deno.json",
		text: manifestText,
	});
	if (!parsed.ok) throw new Error(parsed.error.message);
	return {
		dir: "packages/a",
		manifestPath: "packages/a/deno.json",
		manifestText,
		manifest: parsed.value,
	};
}

Deno.test("checkPackageFiles passes a package with README, MIT LICENSE and license field", () => {
	// Given: a complete published package
	const pkg = member({ name: "@sekhmet/a", license: "MIT" });
	const files = new Map([
		["packages/a/README.md", "# a"],
		["packages/a/LICENSE.md", MIT],
	]);

	// When: checking its files
	const findings = checkPackageFiles({ member: pkg, files });

	// Then: there is nothing to report
	assertEquals(findings, []);
});

Deno.test("checkPackageFiles reports a missing README and LICENSE at the paths to create", () => {
	// Given: a published package with neither file
	const pkg = member({ name: "@sekhmet/a", license: "MIT" });

	// When: checking its files
	const findings = checkPackageFiles({ member: pkg, files: new Map() });

	// Then: both are reported where they belong
	assertEquals(
		findings.map(({ check, file }) => `${check} ${file}`),
		[
			"package-files packages/a/README.md",
			"package-files packages/a/LICENSE.md",
		],
	);
});

Deno.test("checkPackageFiles reports a non-MIT license field on its manifest line", () => {
	// Given: a package whose license field is not MIT
	const pkg = member({ name: "@sekhmet/a", license: "ISC" });
	const files = new Map([
		["packages/a/README.md", "# a"],
		["packages/a/LICENSE.md", MIT],
	]);

	// When: checking its files
	const findings = checkPackageFiles({ member: pkg, files });

	// Then: the license field is reported on line 3 of deno.json
	assertEquals(findings, [
		{
			check: "license",
			file: "packages/a/deno.json",
			line: 3,
			message: '"license" is "ISC", expected "MIT"',
		},
	]);
});

Deno.test("checkPackageFiles reports a LICENSE text that is not MIT", () => {
	// Given: an MIT license field but an Apache LICENSE text
	const pkg = member({ name: "@sekhmet/a", license: "MIT" });
	const files = new Map([
		["packages/a/README.md", "# a"],
		["packages/a/LICENSE.md", "Apache License\nVersion 2.0"],
	]);

	// When: checking its files
	const findings = checkPackageFiles({ member: pkg, files });

	// Then: the mismatch is reported on the LICENSE
	assertEquals(
		findings.map(({ check, file, line }) => `${check} ${file}:${line}`),
		["license packages/a/LICENSE.md:1"],
	);
});

Deno.test("checkExports reports missing, empty and export-less entrypoints on their manifest lines", () => {
	// Given: one good export and three broken ones
	const pkg = member({
		exports: {
			".": "./mod.ts",
			"./missing": "./missing.ts",
			"./empty": "./empty.ts",
			"./silent": "./silent.ts",
		},
	});
	const files = new Map([
		["packages/a/mod.ts", "export const a = 1;"],
		["packages/a/empty.ts", "\n"],
		["packages/a/silent.ts", "// export nothing\nconst b = 2;"],
	]);

	// When: checking the exports
	const findings = checkExports({ member: pkg, files });

	// Then: each broken export is reported on its own line
	assertEquals(
		findings.map(({ line, message }) => `${line} ${message}`),
		[
			'4 export "./missing" points to packages/a/missing.ts, which does not exist',
			'5 export "./empty" points to packages/a/empty.ts, which is empty',
			'6 export "./silent" points to packages/a/silent.ts, which exports nothing',
		],
	);
});

Deno.test("checkPublishExclude passes **/*.test.ts and reports a root without it", () => {
	// Given: a root that excludes tests and one that excludes only docs
	const parse = (exclude: string[]) => {
		const parsed = parseManifest({
			path: "deno.json",
			text: JSON.stringify({ publish: { exclude } }),
		});
		if (!parsed.ok) throw new Error(parsed.error.message);
		return parsed.value;
	};

	// When: checking both
	const good = checkPublishExclude({
		root: parse(["**/*.test.ts"]),
		rootPath: "deno.json",
		rootText: "",
	});
	const bad = checkPublishExclude({
		root: parse(["docs/"]),
		rootPath: "deno.json",
		rootText: "",
	});

	// Then: only the second is reported
	assertEquals(good, []);
	assertEquals(
		bad.map(({ check }) => check),
		["publish-exclude"],
	);
});
