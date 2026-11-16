import { Err, isOk, unwrap } from "@sekhmet/enum/result/mini";
import { assert, assertEquals } from "@std/assert";
import { parseOptions } from "@/src/args.ts";

Deno.test("parseOptions reads a runtime and defaults to the latest versions", () => {
	// Given: only a runtime
	const args = ["webkit"];

	// When: the command line is parsed
	const options = parseOptions(args);

	// Then: no version is requested and nothing is kept
	assert(isOk(options));
	const parsed = unwrap(options);
	assertEquals(parsed.runtime, "webkit");
	assertEquals(parsed.requests.all, undefined);
	assertEquals(parsed.requests.byPackage.size, 0);
	assertEquals(parsed.keep, false);
});

Deno.test("parseOptions reads global and per-package versions", () => {
	// Given: a version for all packages, one for a single package, and --keep
	const args = [
		"node",
		"--version",
		"0.1.0",
		"--version=@sekhmet/enum@0.2.0",
		"--keep",
	];

	// When: the command line is parsed
	const options = parseOptions(args);

	// Then: both requests are kept apart
	assert(isOk(options));
	const parsed = unwrap(options);
	assertEquals(parsed.requests.all, "0.1.0");
	assertEquals([...parsed.requests.byPackage], [["@sekhmet/enum", "0.2.0"]]);
	assertEquals(parsed.keep, true);
});

Deno.test("parseOptions rejects bad command lines", async (t) => {
	const cases: [string, string[], string][] = [
		["a missing runtime", [], "missing <runtime>"],
		["an unknown runtime", ["deno"], "unknown runtime: deno"],
		["an extra argument", ["node", "bun"], "unexpected arguments: bun"],
		["an unknown option", ["node", "--fast"], "unknown option: --fast"],
		[
			"two global versions",
			["node", "--version", "0.1.0", "--version", "0.2.0"],
			"conflicting --version values: 0.1.0 and 0.2.0",
		],
		[
			"a malformed package",
			["node", "--version", "@Bad/x@1.0.0"],
			"not a JSR package name: @Bad/x",
		],
	];

	for (const [label, args, message] of cases) {
		await t.step(label, () => {
			// Given: a bad command line (args)

			// When: it is parsed
			const options = parseOptions(args);

			// Then: it fails with a message saying what is wrong
			assertEquals(options, Err(message));
		});
	}
});
