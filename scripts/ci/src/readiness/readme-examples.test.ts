import { assertEquals } from "@std/assert";
import { checkReadmeExamples } from "./readme-examples.ts";
import type { Member } from "./workspace.ts";

const PACKAGE: Member = {
	dir: "packages/a",
	manifestPath: "packages/a/deno.json",
	manifestText: "{}",
	manifest: {
		name: "@sekhmet/a",
		publish: true,
		publishExclude: [],
		exports: { ".": "./mod.ts" },
		workspace: [],
	},
};

const PLAIN_MODULE = "/**\n * A.\n *\n * @module\n */\nexport {};";

function findingsFor({
	readme,
	mod = PLAIN_MODULE,
}: {
	readme?: string;
	mod?: string;
}): string[] {
	const files = new Map([["packages/a/mod.ts", mod]]);
	if (readme !== undefined) files.set("packages/a/README.md", readme);
	return checkReadmeExamples({ member: PACKAGE, files }).map(
		({ check, file }) => `${check} ${file}`,
	);
}

Deno.test("checkReadmeExamples passes a README with a backtick or tilde fence", () => {
	// Given: READMEs fenced with backticks and with tildes
	const readmes = [
		'# A\n\n```ts\nimport {} from "@sekhmet/a";\n```',
		"~~~\nx\n~~~",
	];

	// When: checking each
	const findings = readmes.flatMap((readme) => findingsFor({ readme }));

	// Then: neither is reported
	assertEquals(findings, []);
});

Deno.test("checkReadmeExamples reports a README with only prose, inline code or indented lines", () => {
	// Given: a README whose only code is inline and an indented list continuation
	const readme = "# A\n\nUse `a()`.\n\n- item\n\n    continued\n";

	// When: checking it, with a module doc that has no example
	const findings = findingsFor({ readme });

	// Then: the README is reported
	assertEquals(findings, ["readme-examples packages/a/README.md"]);
});

Deno.test("checkReadmeExamples accepts an example in the root module doc instead", () => {
	// Given: a prose README, and root module docs with an @example or a fence
	const readme = "# A\n\nProse only.";
	const withTag = "/**\n * A.\n *\n * @example\n * a();\n *\n * @module\n */";
	const withFence = "/**\n * ```ts\n * a();\n * ```\n *\n * @module\n */";

	// When: checking each
	const findings = [withTag, withFence].flatMap((mod) => {
		return findingsFor({ readme, mod });
	});

	// Then: neither is reported
	assertEquals(findings, []);
});

Deno.test("checkReadmeExamples ignores an example in a doc block that is no module doc", () => {
	// Given: a prose README, and a root module that opens with a symbol doc
	// holding an @example
	const readme = "# A\n\nProse only.";
	const mod =
		"/**\n * Adds.\n *\n * @example\n * add();\n */\nexport function add() {}";

	// When: checking it
	const findings = findingsFor({ readme, mod });

	// Then: the README is reported
	assertEquals(findings, ["readme-examples packages/a/README.md"]);
});

Deno.test("checkReadmeExamples leaves a missing README to package-files", () => {
	// Given: no README at all
	// When: checking the package
	const findings = findingsFor({});

	// Then: nothing is reported here
	assertEquals(findings, []);
});
