import { assertEquals, assertStringIncludes } from "@std/assert";
import {
	applyLink,
	buildLink,
	danglingLinks,
	decodePackage,
	describeStatus,
	findWorktree,
	formatConfig,
	type LinkedPackage,
	OWNERSHIP_KEY,
	type PlaygroundLink,
	parseCommand,
	parseConfig,
	parseWorktrees,
	readLinkState,
	removeLink,
} from "@/src/link.ts";

const CHECKOUT = "/repo";
const PLAYGROUND = "/repo/playground";
const WORKTREE = "/repo/.claude/worktrees/agent-1";

const PORCELAIN = [
	`worktree ${CHECKOUT}`,
	"HEAD 1c69cef9702a6675ba3dae558183c465e8b78935",
	"branch refs/heads/main",
	"",
	`worktree ${WORKTREE}`,
	"HEAD fbfc62b849f5f0ed2d6f1324c41d9ba93b02c3f7",
	"branch refs/heads/refactor/schema-declarative",
	"locked claude agent agent-1",
	"",
	"worktree /repo/.claude/worktrees/detached",
	"HEAD 95af3525b7b1b886a5330857b97ea70d4975dce4",
	"detached",
	"",
].join("\n");

const ENUM: LinkedPackage = {
	name: "@sekhmet/enum",
	version: "0.2.0",
	directory: "enum",
};

const PACKAGES: LinkedPackage[] = [
	{ name: "@sekhmet/schema", version: "0.1.0", directory: "schema" },
	ENUM,
	{ name: "@sekhmet/draft", directory: "draft" },
];

const LINK: PlaygroundLink = {
	imports: { "@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0" },
	rootImports: {},
	links: ["../packages/enum"],
	compilerOptions: { strict: true },
};

const STD_LINK: PlaygroundLink = {
	...LINK,
	rootImports: {
		"@std/assert": "jsr:@std/assert@1.0.16",
		"@std/testing": "jsr:@std/testing@1.0.16",
	},
};

Deno.test("parseCommand", async (t) => {
	await t.step("no argument asks for the status", () => {
		// Given: no arguments
		// When: parsing them
		const parsed = parseCommand([]);

		// Then: it is the status command
		assertEquals(parsed, { ok: true, value: { kind: "status" } });
	});

	await t.step("off and unlink both remove the link", () => {
		// Given: either spelling of "off"
		// When: parsing each
		const parsed = [parseCommand(["off"]), parseCommand(["unlink"])];

		// Then: both are the off command
		assertEquals(parsed, [
			{ ok: true, value: { kind: "off" } },
			{ ok: true, value: { kind: "off" } },
		]);
	});

	await t.step("main and checkout name this clone's checkout", () => {
		// Given: either alias for the main checkout
		// When: parsing each
		const parsed = [parseCommand(["main"]), parseCommand(["checkout"])];

		// Then: both link to the checkout
		const checkout = {
			ok: true,
			value: { kind: "link", target: { kind: "checkout" } },
		} as const;
		assertEquals(parsed, [checkout, checkout]);
	});

	await t.step("a path starts with /, . or ~", () => {
		// Given: absolute, relative and home-relative paths
		const args = ["/abs/tree", "./tree", "../tree", "~/tree"];

		// When: parsing each
		const parsed = args.map((arg) => parseCommand([arg]));

		// Then: each is a path target, kept as written
		assertEquals(
			parsed,
			args.map((path) => ({
				ok: true,
				value: { kind: "link", target: { kind: "path", path } },
			})),
		);
	});

	await t.step("anything else is a branch, slashes included", () => {
		// Given: a branch name with a slash
		// When: parsing it
		const parsed = parseCommand(["refactor/schema-declarative"]);

		// Then: it is a branch target
		assertEquals(parsed, {
			ok: true,
			value: {
				kind: "link",
				target: { kind: "branch", branch: "refactor/schema-declarative" },
			},
		});
	});

	await t.step("more than one argument is an error", () => {
		// Given: two targets
		// When: parsing them
		const parsed = parseCommand(["main", "off"]);

		// Then: it is rejected
		assertEquals(parsed.ok, false);
	});
});

Deno.test("parseWorktrees", async (t) => {
	await t.step("reads each block's path and short branch name", () => {
		// Given: porcelain output with a main checkout, a locked worktree and a
		// detached one
		// When: parsing it
		const worktrees = parseWorktrees(PORCELAIN);

		// Then: branches lose refs/heads/ and the detached tree has none
		assertEquals(worktrees, [
			{ path: CHECKOUT, branch: "main" },
			{ path: WORKTREE, branch: "refactor/schema-declarative" },
			{ path: "/repo/.claude/worktrees/detached" },
		]);
	});

	await t.step("empty output means no worktrees", () => {
		// Given: no output
		// When: parsing it
		const worktrees = parseWorktrees("");

		// Then: nothing is listed
		assertEquals(worktrees, []);
	});
});

Deno.test("findWorktree", async (t) => {
	const worktrees = parseWorktrees(PORCELAIN);

	await t.step("finds the worktree that has the branch", () => {
		// Given: worktrees including one on refactor/schema-declarative
		// When: looking that branch up
		const found = findWorktree({
			worktrees,
			branch: "refactor/schema-declarative",
		});

		// Then: it is that worktree
		assertEquals(found, {
			ok: true,
			value: { path: WORKTREE, branch: "refactor/schema-declarative" },
		});
	});

	await t.step("a branch without a worktree lists those that have one", () => {
		// Given: a branch no worktree has checked out
		// When: looking it up
		const found = findWorktree({ worktrees, branch: "feat/nowhere" });

		// Then: the error names the branch and the available ones
		assertEquals(found.ok, false);
		if (found.ok) return;
		assertStringIncludes(found.error, "`feat/nowhere`");
		assertStringIncludes(found.error, "main, refactor/schema-declarative");
	});
});

Deno.test("decodePackage", async (t) => {
	await t.step("reads the name and version", () => {
		// Given: a package deno.json
		const json = { name: "@sekhmet/enum", version: "0.1.0", exports: {} };

		// When: decoding it
		const decoded = decodePackage({ json, directory: "enum" });

		// Then: it carries the name, version and directory
		assertEquals(decoded, {
			ok: true,
			value: { name: "@sekhmet/enum", version: "0.1.0", directory: "enum" },
		});
	});

	await t.step("a package without a version has none", () => {
		// Given: an unversioned package
		const json = { name: "@sekhmet/draft" };

		// When: decoding it
		const decoded = decodePackage({ json, directory: "draft" });

		// Then: the version is absent
		assertEquals(decoded, {
			ok: true,
			value: { name: "@sekhmet/draft", directory: "draft" },
		});
	});

	await t.step("rejects anything that is not a @sekhmet/* package", () => {
		// Given: contents that are not a sekhmet package
		const inputs: unknown[] = [null, [], { version: "1" }, { name: "@std/x" }];

		// When: decoding each
		const decoded = inputs.map((json) =>
			decodePackage({ json, directory: "x" }),
		);

		// Then: every one is an error
		assertEquals(
			decoded.map(({ ok }) => ok),
			[false, false, false, false],
		);
	});
});

Deno.test("buildLink", async (t) => {
	await t.step("imports and links every package, sorted by name", () => {
		// Given: three packages in a worktree, one unversioned
		// When: building the link from the checkout's playground
		const link = buildLink({
			packages: PACKAGES,
			root: WORKTREE,
			playground: PLAYGROUND,
			compilerOptions: { strict: true },
			imports: undefined,
		});

		// Then: each gets a jsr import (a caret range when versioned) and a
		// link relative to playground/
		assertEquals(link, {
			imports: {
				"@sekhmet/draft": "jsr:@sekhmet/draft",
				"@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0",
				"@sekhmet/schema": "jsr:@sekhmet/schema@^0.1.0",
			},
			rootImports: {},
			links: [
				"../.claude/worktrees/agent-1/packages/draft",
				"../.claude/worktrees/agent-1/packages/enum",
				"../.claude/worktrees/agent-1/packages/schema",
			],
			compilerOptions: { strict: true },
		});
	});

	await t.step("the checkout links to its own packages", () => {
		// Given: the checkout as the target, with no compilerOptions
		// When: building the link
		const link = buildLink({
			packages: [ENUM],
			root: CHECKOUT,
			playground: PLAYGROUND,
			compilerOptions: undefined,
			imports: undefined,
		});

		// Then: links climb one level and compilerOptions is left out
		assertEquals(link, {
			imports: { "@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0" },
			rootImports: {},
			links: ["../packages/enum"],
		});
	});

	await t.step("carries the root's other imports, rebasing paths", () => {
		// Given: a worktree whose root deno.json imports @std/*, an npm
		// package, a root path alias, a @sekhmet/* package and a non-string
		const imports = {
			"@std/assert": "jsr:@std/assert@1.0.16",
			"@biomejs/biome": "npm:@biomejs/biome@^2.6.8",
			"@~/": "./",
			"@scratch/": "../shared/",
			"@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0",
			broken: 1,
		};

		// When: building the link from the checkout's playground
		const link = buildLink({
			packages: [ENUM],
			root: WORKTREE,
			playground: PLAYGROUND,
			compilerOptions: undefined,
			imports,
		});

		// Then: specifiers stay as they are, relative paths point at the same
		// place from playground/, and @sekhmet/* and non-strings are left out
		assertEquals(link.rootImports, {
			"@std/assert": "jsr:@std/assert@1.0.16",
			"@biomejs/biome": "npm:@biomejs/biome@^2.6.8",
			"@~/": "../.claude/worktrees/agent-1/",
			"@scratch/": "../.claude/worktrees/shared/",
		});
	});

	await t.step("root imports that are not an object are none", () => {
		// Given: a root deno.json whose imports is a string
		// When: building the link
		const link = buildLink({
			packages: [ENUM],
			root: CHECKOUT,
			playground: PLAYGROUND,
			compilerOptions: undefined,
			imports: "nope",
		});

		// Then: no root imports are carried
		assertEquals(link.rootImports, {});
	});
});

Deno.test("applyLink", async (t) => {
	await t.step("writes the owned keys into an empty config", () => {
		// Given: no existing config
		// When: applying a link
		const merged = applyLink({ config: {}, link: LINK });

		// Then: the config is exactly the link
		assertEquals(merged, {
			ok: true,
			value: {
				imports: LINK.imports,
				links: LINK.links,
				compilerOptions: LINK.compilerOptions,
			},
		});
	});

	await t.step("keeps the owner's keys and imports, replaces ours", () => {
		// Given: a config with an owner import, an owner key and a stale link
		const config = {
			imports: {
				"@std/assert": "jsr:@std/assert@1",
				"@sekhmet/vow": "jsr:@sekhmet/vow@^0.1.0",
			},
			links: ["../old/packages/vow"],
			compilerOptions: { strict: false },
			tasks: { try: "deno run try.ts" },
		};

		// When: applying a new link
		const merged = applyLink({ config, link: LINK });

		// Then: stale @sekhmet imports, links and compilerOptions are replaced;
		// the rest stays
		assertEquals(merged, {
			ok: true,
			value: {
				imports: {
					"@std/assert": "jsr:@std/assert@1",
					"@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0",
				},
				links: ["../packages/enum"],
				tasks: { try: "deno run try.ts" },
				compilerOptions: { strict: true },
			},
		});
	});

	await t.step("an imports value that is not an object is an error", () => {
		// Given: a config whose imports is a string
		// When: applying a link
		const merged = applyLink({ config: { imports: "x" }, link: LINK });

		// Then: it is refused rather than overwritten
		assertEquals(merged.ok, false);
	});

	await t.step("writes the root imports and records them as ours", () => {
		// Given: no existing config
		// When: applying a link that carries root imports
		const merged = applyLink({ config: {}, link: STD_LINK });

		// Then: they join the imports, and the ownership record names them
		assertEquals(merged, {
			ok: true,
			value: {
				imports: { ...STD_LINK.rootImports, ...STD_LINK.imports },
				links: STD_LINK.links,
				compilerOptions: STD_LINK.compilerOptions,
				[OWNERSHIP_KEY]: { imports: ["@std/assert", "@std/testing"] },
			},
		});
	});

	await t.step("an import the owner set keeps the owner's value", () => {
		// Given: the owner pinned @std/assert before any link
		const config = { imports: { "@std/assert": "jsr:@std/assert@1" } };

		// When: applying a link whose root also imports it
		const merged = applyLink({ config, link: STD_LINK });

		// Then: the owner's value stays and only @std/testing is ours
		assertEquals(merged, {
			ok: true,
			value: {
				imports: {
					"@std/assert": "jsr:@std/assert@1",
					"@std/testing": "jsr:@std/testing@1.0.16",
					"@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0",
				},
				links: STD_LINK.links,
				compilerOptions: STD_LINK.compilerOptions,
				[OWNERSHIP_KEY]: { imports: ["@std/testing"] },
			},
		});
	});

	await t.step("a relink replaces the root imports we wrote before", () => {
		// Given: a config linked to a root that imported @std/fmt, plus an
		// owner import
		const linked = applyLink({
			config: { imports: { "@my/lib": "jsr:@my/lib@1" } },
			link: { ...LINK, rootImports: { "@std/fmt": "jsr:@std/fmt@1" } },
		});
		const config = linked.ok ? linked.value : {};

		// When: relinking to a root that imports @std/assert instead
		const merged = applyLink({
			config,
			link: { ...LINK, rootImports: { "@std/assert": "jsr:@std/assert@2" } },
		});

		// Then: the old root import goes, the new one is ours, the owner's stays
		assertEquals(merged, {
			ok: true,
			value: {
				imports: {
					"@my/lib": "jsr:@my/lib@1",
					"@std/assert": "jsr:@std/assert@2",
					"@sekhmet/enum": "jsr:@sekhmet/enum@^0.2.0",
				},
				links: LINK.links,
				compilerOptions: LINK.compilerOptions,
				[OWNERSHIP_KEY]: { imports: ["@std/assert"] },
			},
		});
	});
});

Deno.test("removeLink", async (t) => {
	await t.step("a config with only our keys is deleted", () => {
		// Given: a config play:link wrote
		const { rootImports: _, ...config } = LINK;

		// When: removing the link
		const remaining = removeLink(config);

		// Then: nothing is left, so the file goes
		assertEquals(remaining, { ok: true, value: undefined });
	});

	await t.step("the owner's keys and imports survive", () => {
		// Given: a linked config with an owner import and key
		const config = {
			imports: { ...LINK.imports, "@std/assert": "jsr:@std/assert@1" },
			links: LINK.links,
			compilerOptions: LINK.compilerOptions,
			tasks: { try: "deno run try.ts" },
		};

		// When: removing the link
		const remaining = removeLink(config);

		// Then: only the owner's parts remain
		assertEquals(remaining, {
			ok: true,
			value: {
				tasks: { try: "deno run try.ts" },
				imports: { "@std/assert": "jsr:@std/assert@1" },
			},
		});
	});

	await t.step("removes exactly the root imports it recorded", () => {
		// Given: a linked config with root imports we wrote and one the owner
		// set, which the link left alone
		const linked = applyLink({
			config: {
				imports: { "@std/assert": "jsr:@std/assert@1" },
				tasks: { try: "deno run try.ts" },
			},
			link: STD_LINK,
		});
		const config = linked.ok ? linked.value : {};

		// When: removing the link
		const remaining = removeLink(config);

		// Then: our @std/testing and the record go; the owner's @std/assert stays
		assertEquals(remaining, {
			ok: true,
			value: {
				tasks: { try: "deno run try.ts" },
				imports: { "@std/assert": "jsr:@std/assert@1" },
			},
		});
	});

	await t.step(
		"a config with only what we wrote, root imports included, is deleted",
		() => {
			// Given: a config play:link wrote with root imports
			const linked = applyLink({ config: {}, link: STD_LINK });
			const config = linked.ok ? linked.value : { owner: true };

			// When: removing the link
			const remaining = removeLink(config);

			// Then: nothing is left
			assertEquals(remaining, { ok: true, value: undefined });
		},
	);

	await t.step("an imports value that is not an object is an error", () => {
		// Given: a config whose imports is an array
		// When: removing the link
		const remaining = removeLink({ imports: [] });

		// Then: it is refused
		assertEquals(remaining.ok, false);
	});
});

Deno.test("readLinkState", async (t) => {
	await t.step("the tree is the parent of the links' packages/", () => {
		// Given: a config linking into a worktree
		const config = {
			links: [
				"../.claude/worktrees/agent-1/packages/enum",
				"../.claude/worktrees/agent-1/packages/schema",
			],
		};

		// When: reading the state
		const state = readLinkState({ config, playground: PLAYGROUND });

		// Then: it names the worktree and the absolute links
		assertEquals(state, {
			kind: "linked",
			root: WORKTREE,
			links: [`${WORKTREE}/packages/enum`, `${WORKTREE}/packages/schema`],
		});
	});

	await t.step("no file, no links or empty links is unlinked", () => {
		// Given: configs without usable links
		const configs = [undefined, {}, { links: [] }, { links: "x" }];

		// When: reading each state
		const states = configs.map((config) =>
			readLinkState({ config, playground: PLAYGROUND }),
		);

		// Then: every one is unlinked
		assertEquals(
			states.map(({ kind }) => kind),
			["unlinked", "unlinked", "unlinked", "unlinked"],
		);
	});
});

Deno.test("danglingLinks", async (t) => {
	await t.step("lists the links whose directory is gone", () => {
		// Given: two links, one of which no longer exists
		const links = ["/a/packages/enum", "/gone/packages/enum"];

		// When: checking them
		const dangling = danglingLinks({
			links,
			exists: (path) => path.startsWith("/a/"),
		});

		// Then: only the missing one is listed
		assertEquals(dangling, ["/gone/packages/enum"]);
	});
});

Deno.test("describeStatus", async (t) => {
	await t.step("unlinked says how to link", () => {
		// Given: no link
		// When: describing it
		const text = describeStatus({
			state: { kind: "unlinked" },
			dangling: [],
			revision: undefined,
		});

		// Then: it says the root workspace governs playground/
		assertStringIncludes(text, "not linked");
		assertStringIncludes(text, "deno task play:link");
	});

	await t.step("linked names the tree and its revision", () => {
		// Given: a live link
		const state = {
			kind: "linked",
			root: WORKTREE,
			links: [`${WORKTREE}/packages/enum`],
		} as const;

		// When: describing it
		const text = describeStatus({
			state,
			dangling: [],
			revision: "branch x, commit abc",
		});

		// Then: one line with the tree and revision
		assertEquals(
			text,
			`playground/ is linked to ${WORKTREE} (branch x, commit abc)`,
		);
	});

	await t.step("dangling links say how to fix them", () => {
		// Given: a link whose worktree was removed
		const state = {
			kind: "linked",
			root: WORKTREE,
			links: [`${WORKTREE}/packages/enum`],
		} as const;

		// When: describing it
		const text = describeStatus({
			state,
			dangling: state.links,
			revision: undefined,
		});

		// Then: it counts the dangling links and suggests relinking or off
		assertStringIncludes(text, "1 of 1 link paths no longer exist");
		assertStringIncludes(text, "deno task play:link main");
		assertStringIncludes(text, "deno task play:link off");
	});
});

Deno.test("parseConfig and formatConfig", async (t) => {
	await t.step("round-trip with tabs and a final newline", () => {
		// Given: a config
		const config = { imports: { a: "b" } };

		// When: formatting and parsing it back
		const text = formatConfig(config);

		// Then: it is tab-indented and parses to the same object
		assertEquals(text, '{\n\t"imports": {\n\t\t"a": "b"\n\t}\n}\n');
		assertEquals(parseConfig(text), { ok: true, value: config });
	});

	await t.step("invalid JSON and non-objects are errors", () => {
		// Given: text that is not a JSON object
		const inputs = ["{", "[]", "1"];

		// When: parsing each
		const parsed = inputs.map(parseConfig);

		// Then: every one is an error
		assertEquals(
			parsed.map(({ ok }) => ok),
			[false, false, false],
		);
	});
});
