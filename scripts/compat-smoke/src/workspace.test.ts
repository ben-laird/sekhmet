import { isErr, isOk, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import { EXERCISES } from "@/probe/exercises/mod.ts";
import { publishedNames } from "@/src/workspace.ts";

Deno.test("publishedNames keeps the packages that publish", () => {
	// Given: manifests for a published and an unpublished package
	const manifests = new Map<string, unknown>([
		["packages/vow/deno.json", { name: "@sekhmet/vow", version: "0.1.0" }],
		["packages/enum/deno.json", { name: "@sekhmet/enum", version: "0.1.0" }],
		["packages/tool/deno.json", { name: "@sekhmet/tool", publish: false }],
	]);

	// When: the published names are read
	const names = publishedNames(manifests);

	// Then: only the published ones, sorted
	assert(isOk(names));
	assertEquals<string[]>(unwrap(names), ["@sekhmet/enum", "@sekhmet/vow"]);
});

Deno.test("publishedNames rejects a manifest without a package name", () => {
	// Given: a manifest whose name is not @scope/name
	const manifests = new Map<string, unknown>([
		["packages/x/deno.json", { name: "x" }],
	]);

	// When: the published names are read
	const names = publishedNames(manifests);

	// Then: it fails naming the manifest
	assert(isErr(names));
	assert(unwrapErr(names).startsWith("packages/x/deno.json"));
});

Deno.test("every package the repository publishes has an exercise", async () => {
	// Given: the repository's package manifests
	const root = new URL("../../../packages/", import.meta.url);
	const manifests = new Map<string, unknown>();
	for await (const entry of Deno.readDir(root)) {
		if (!entry.isDirectory) continue;
		const text = await Deno.readTextFile(
			new URL(`${entry.name}/deno.json`, root),
		);
		manifests.set(entry.name, JSON.parse(text));
	}

	// When: the published names are read
	const names = publishedNames(manifests);

	// Then: the exercises cover exactly those packages
	assert(isOk(names));
	assertEquals(Object.keys(EXERCISES).sort(), unwrap(names));
});
