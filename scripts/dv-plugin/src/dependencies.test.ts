import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseModuleGraph, workspaceDependencies } from "./dependencies.ts";

const ROOT = "/repo/packages";
const CANDIDATES = [
	"@sekhmet/effect",
	"@sekhmet/enum",
	"@sekhmet/primordials",
	"@sekhmet/panic",
];

Deno.test("workspaceDependencies reads bare workspace imports from the package's own modules", () => {
	// Given: panic's graph, which also contains enum's modules
	const graph = {
		modules: [
			{
				local: `${ROOT}/panic/mod.ts`,
				dependencies: [
					{ specifier: "./src/mini/mod.ts" },
					{ specifier: "@sekhmet/enum/result/mini" },
				],
			},
			{
				local: `${ROOT}/enum/src/result/main/mod.ts`,
				dependencies: [{ specifier: "@sekhmet/primordials/struct" }],
			},
		],
	};

	// When: computing panic's dependencies
	const dependencies = workspaceDependencies({
		graphs: [graph],
		packageDirectory: `${ROOT}/panic`,
		candidates: CANDIDATES,
	});

	// Then: only its direct import counts, not enum's transitive one
	assertEquals(dependencies, ["@sekhmet/enum"]);
});

Deno.test("workspaceDependencies ignores non-candidates and merges entry points", () => {
	// Given: two entry graphs importing a candidate, an external and a sibling dir prefix
	const graphs = [
		{
			modules: [
				{
					local: `${ROOT}/effect/mod.ts`,
					dependencies: [
						{ specifier: "@sekhmet/primordials/struct" },
						{ specifier: "jsr:@std/assert@1" },
					],
				},
			],
		},
		{
			modules: [
				{
					local: `${ROOT}/effect/src/fiber.ts`,
					dependencies: [{ specifier: "@sekhmet/enum/result/mini" }],
				},
				{
					local: `${ROOT}/effect-extra/mod.ts`,
					dependencies: [{ specifier: "@sekhmet/panic" }],
				},
				{ dependencies: [{ specifier: "@sekhmet/panic" }] },
			],
		},
	];

	// When: computing effect's dependencies
	const dependencies = workspaceDependencies({
		graphs,
		packageDirectory: `${ROOT}/effect`,
		candidates: CANDIDATES,
	});

	// Then: externals, look-alike directories and remote modules are excluded
	assertEquals(dependencies, ["@sekhmet/enum", "@sekhmet/primordials"]);
});

Deno.test("workspaceDependencies returns nothing for empty candidates", () => {
	// Given: a graph with workspace imports but no candidates (dv verify's probe)
	const graph = {
		modules: [
			{
				local: `${ROOT}/vow/mod.ts`,
				dependencies: [{ specifier: "@sekhmet/enum" }],
			},
		],
	};

	// When: computing dependencies
	const dependencies = workspaceDependencies({
		graphs: [graph],
		packageDirectory: `${ROOT}/vow`,
		candidates: [],
	});

	// Then: the subset is empty
	assertEquals(dependencies, []);
});

Deno.test("parseModuleGraph accepts deno info output and rejects other shapes", () => {
	// Given: a deno-info-shaped value and a malformed one
	const valid = {
		version: 1,
		roots: [],
		modules: [{ specifier: "file:///x.ts", local: "/x.ts" }],
	};

	// When / Then: the valid one parses, the malformed one explains itself
	assertEquals(unwrap(parseModuleGraph(valid)).modules, [{ local: "/x.ts" }]);
	assertStringIncludes(unwrapErr(parseModuleGraph({ modules: 1 })), "modules");
});
