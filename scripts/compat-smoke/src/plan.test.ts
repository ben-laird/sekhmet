import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { BROWSER_REPORT_GLOBAL, renderEntry } from "@/src/entry.ts";
import {
	exportPaths,
	isPackageName,
	type PublishedPackage,
} from "@/src/package.ts";
import { npmSpecs, planFor, TOOLS } from "@/src/plan.ts";
import { isRuntime, RUNTIMES, targetOf } from "@/src/runtime.ts";

function published(name: string, version: string): PublishedPackage {
	if (!isPackageName(name)) throw new Error(`bad fixture: ${name}`);
	return { name, version, exports: { ".": "./mod.ts" } };
}

const PACKAGES = [
	published("@sekhmet/enum", "0.1.0"),
	published("@sekhmet/vow", "0.2.0"),
];

Deno.test("every runtime maps to the target that runs it", () => {
	// Given: every runtime name

	// When: each is mapped to its target
	const targets = RUNTIMES.map((runtime) => targetOf(runtime).kind);

	// Then: Node and Bun run as servers, the engines in a browser, workerd alone
	assertEquals(targets, [
		"server",
		"server",
		"browser",
		"browser",
		"browser",
		"workerd",
	]);
	assert(isRuntime("bun"));
	assert(!isRuntime("deno"));
});

Deno.test("planFor installs the way each runtime's users do", async (t) => {
	await t.step("node uses npx jsr add and runs the probe with node", () => {
		// Given: the node target
		const target = targetOf("node");

		// When: its plan is made
		const plan = planFor({ target, packages: PACKAGES });

		// Then: jsr add installs the packages and node runs the bundle
		assertEquals(plan.install[0], {
			program: "npx",
			args: [
				"--yes",
				`jsr@${TOOLS.jsr}`,
				"add",
				"@sekhmet/enum@0.1.0",
				"@sekhmet/vow@0.2.0",
			],
		});
		assertEquals(plan.npmrc, undefined);
		assert(plan.build.args.includes("--packages=external"));
		assertEquals(plan.run, { program: "node", args: ["dist/entry.js"] });
	});

	await t.step("bun uses bunx jsr add and runs the probe with bun", () => {
		// Given: the bun target
		const target = targetOf("bun");

		// When: its plan is made
		const plan = planFor({ target, packages: PACKAGES });

		// Then: bunx installs and bun runs the bundle
		assertEquals(plan.install[0]?.program, "bunx");
		assertEquals(plan.run, { program: "bun", args: ["dist/entry.js"] });
	});

	await t.step(
		"browsers install from JSR's npm registry and bundle everything",
		() => {
			// Given: a browser target
			const target = targetOf("firefox");

			// When: its plan is made
			const plan = planFor({ target, packages: PACKAGES });

			// Then: npm installs the aliases, esbuild bundles for the browser, Playwright runs it
			assertEquals(plan.npmrc, "@jsr:registry=https://npm.jsr.io\n");
			assertStringIncludes(
				plan.install[0]?.args.join(" ") ?? "",
				"@sekhmet/vow@npm:@jsr/sekhmet__vow@0.2.0",
			);
			assert(plan.build.args.includes("--platform=browser"));
			assert(!plan.build.args.includes("--packages=external"));
			assertEquals(plan.run, {
				program: "node",
				args: ["runners/browser.mjs", "firefox", "dist"],
			});
		},
	);

	await t.step("workerd bundles one Worker module for Miniflare", () => {
		// Given: the workerd target
		const target = targetOf("workerd");

		// When: its plan is made
		const plan = planFor({ target, packages: PACKAGES });

		// Then: the bundle is a single file under worker conditions
		assert(plan.build.args.includes("--outfile=dist/worker.js"));
		assert(plan.build.args.includes("--conditions=workerd,worker,browser"));
		assertEquals(plan.run.args[0], "runners/workerd.mjs");
	});
});

Deno.test("npmSpecs aliases each package to its exact JSR npm version", () => {
	// Given: published packages

	// When: their npm install specs are made
	const specs = npmSpecs(PACKAGES);

	// Then: each is an exact-version alias
	assertEquals(specs, [
		"@sekhmet/enum@npm:@jsr/sekhmet__enum@0.1.0",
		"@sekhmet/vow@npm:@jsr/sekhmet__vow@0.2.0",
	]);
});

Deno.test("renderEntry imports every export path with a literal import()", async (t) => {
	const paths = [
		...exportPaths({
			...published("@sekhmet/enum", "0.1.0"),
			exports: { "./option": "./option.ts" },
		}),
		...exportPaths(published("@sekhmet/vow", "0.2.0")),
	];

	await t.step("server entries print the report", () => {
		// Given: two export paths and the node target

		// When: the entry is rendered
		const source = renderEntry({ target: targetOf("node"), paths });

		// Then: each path is a literal import and the report goes to stdout
		assertStringIncludes(source, 'load: () => import("@sekhmet/enum/option")');
		assertStringIncludes(source, 'load: () => import("@sekhmet/vow")');
		assertStringIncludes(
			source,
			"console.log(REPORT_MARKER + JSON.stringify(report));",
		);
	});

	await t.step("browser entries leave the report on a global", () => {
		// Given: a browser target

		// When: the entry is rendered with no paths
		const source = renderEntry({ target: targetOf("chromium"), paths: [] });

		// Then: the report is stored where the runner looks
		assertStringIncludes(
			source,
			`Reflect.set(globalThis, "${BROWSER_REPORT_GLOBAL}", report);`,
		);
	});

	await t.step("workerd entries answer a fetch with the report", () => {
		// Given: the workerd target

		// When: the entry is rendered
		const source = renderEntry({ target: targetOf("workerd"), paths: [] });

		// Then: the probe runs inside the fetch handler
		assertStringIncludes(source, "async fetch(): Promise<Response> {");
		assertStringIncludes(
			source,
			"return new Response(REPORT_MARKER + JSON.stringify(report));",
		);
	});
});
