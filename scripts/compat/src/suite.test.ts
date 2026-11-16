import { assertEquals, assertMatch } from "@std/assert";
import type { Harness } from "./harness.ts";
import { runSuite } from "./suite.ts";

Deno.test("runSuite() gives each file a fresh harness and keeps going after a load failure", async () => {
	// Given: three files, the middle one throwing while it loads
	let test: Harness["test"] = () => {};
	const install = (next: Harness["test"]): void => {
		test = next;
	};
	const files = [
		{
			package: "a",
			path: "packages/a/one.test.ts",
			load: () => Promise.resolve(test("one", () => {})),
		},
		{
			package: "a",
			path: "packages/a/broken.test.ts",
			load: () => Promise.reject(new SyntaxError("Unexpected token")),
		},
		{
			package: "b",
			path: "packages/b/two.test.ts",
			load: () => Promise.resolve(test("two", () => {})),
		},
	];

	// When: the suite runs
	const { files: reports } = await runSuite({ files, install });

	// Then: each loaded file reports only its own test, and the broken one is a load failure
	assertEquals(reports.length, 3);
	assertEquals(reports[0], {
		package: "a",
		path: "packages/a/one.test.ts",
		kind: "ran",
		tests: [{ name: "one", outcome: { kind: "passed" }, steps: [] }],
		usedOnly: false,
	});
	const broken = reports[1];
	assertEquals(broken?.kind, "load-failed");
	assertMatch(
		broken?.kind === "load-failed" ? broken.error : "",
		/^SyntaxError: Unexpected token/,
	);
	assertEquals(
		reports[2]?.kind === "ran" ? reports[2].tests.map((t) => t.name) : [],
		["two"],
	);
});
