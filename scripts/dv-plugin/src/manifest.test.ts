import { unwrap, unwrapErr } from "@sekhmet/enum/result";
import { assertEquals } from "@std/assert";
import {
	exportTargets,
	isReleasable,
	parseManifest,
	setVersion,
	updateDependency,
} from "./manifest.ts";

Deno.test("isReleasable excludes unnamed and publish:false members", () => {
	// Given: a package, a script and an unnamed member
	const published = { name: "@sekhmet/enum", version: "0.1.0" };
	const script = { name: "@sekhmet/ci", version: "0.1.0", publish: false };
	const unnamed = { version: "0.1.0" };

	// When / Then: only the publishing, named member is releasable
	assertEquals(isReleasable(published), true);
	assertEquals(isReleasable(script), false);
	assertEquals(isReleasable(unnamed), false);
});

Deno.test("isReleasable keeps members with a publish configuration object", () => {
	// Given: a member that configures publishing rather than disabling it
	const manifest = { name: "@sekhmet/x", publish: { exclude: ["*.test.ts"] } };

	// When / Then: it is releasable
	assertEquals(isReleasable(manifest), true);
});

Deno.test("exportTargets lists entry points once each", () => {
	// Given: string and map exports, with a repeated target
	const single = { exports: "./mod.ts" };
	const map = {
		exports: { ".": "./mod.ts", "./a": "./a.ts", "./alias": "./a.ts" },
	};

	// When / Then: targets come out deduplicated, in order
	assertEquals(exportTargets(single), ["./mod.ts"]);
	assertEquals(exportTargets(map), ["./mod.ts", "./a.ts"]);
	assertEquals(exportTargets({}), []);
});

Deno.test("parseManifest rejects a malformed shape", () => {
	// Given: a manifest whose imports map holds a number
	const text = `{ "name": "x", "imports": { "a": 1 } }`;

	// When: parsing it
	const manifest = parseManifest(text);

	// Then: the shape error is reported
	assertEquals(unwrapErr(manifest).kind, "invalid-shape");
});

Deno.test("setVersion rewrites only the version", () => {
	// Given: a manifest
	const text = `{\n\t"name": "x",\n\t"version": "0.1.0"\n}\n`;

	// When: setting a new version
	const edited = setVersion({ text, version: "0.2.0" });

	// Then: formatting is preserved
	assertEquals(unwrap(edited), `{\n\t"name": "x",\n\t"version": "0.2.0"\n}\n`);
});

Deno.test("updateDependency rewrites every import entry for the dependency", () => {
	// Given: a manifest importing enum twice and primordials once
	const text = `{
	"imports": {
		"@sekhmet/enum": "jsr:@sekhmet/enum@^0.1.0",
		"@sekhmet/enum/": "jsr:/@sekhmet/enum@^0.1.0/",
		"@sekhmet/primordials": "jsr:@sekhmet/primordials@^0.1.0"
	}
}`;

	// When: enum moves to 0.2.0
	const update = updateDependency({
		text,
		dependency: "@sekhmet/enum",
		version: "0.2.0",
	});

	// Then: both enum entries move; primordials does not
	assertEquals(unwrap(update), {
		changed: true,
		text: text.replaceAll("enum@^0.1.0", "enum@^0.2.0"),
	});
});

Deno.test("updateDependency is a no-op for workspace-resolved imports", () => {
	// Given: a member that imports siblings through the workspace (no entry)
	const text = `{\n\t"imports": {\n\t\t"@/": "./"\n\t}\n}\n`;

	// When: a sibling's version moves
	const update = updateDependency({
		text,
		dependency: "@sekhmet/enum",
		version: "0.2.0",
	});

	// Then: nothing changes
	assertEquals(unwrap(update), { text, changed: false });
});
