import { assertEquals, assertMatch } from "@std/assert";
import type { Harness } from "./harness.ts";
import { runSuite } from "./suite.ts";
import type { UncaughtListener, Unwatch } from "./uncaught.ts";

/** A `Deno.test` slot the suite installs into, as the generated entry does. */
function installer(): {
	install: (next: Harness["test"]) => void;
	test: Harness["test"];
} {
	let current: Harness["test"] = () => {};
	return {
		install: (next) => {
			current = next;
		},
		test: (...args) => current(...args),
	};
}

/** A watch the test fires by hand, recording whether the suite unwatched. */
function manualWatch(): {
	watch: (listener: UncaughtListener) => Unwatch;
	fire: (error: unknown) => void;
	watching: () => boolean;
} {
	let listener: UncaughtListener | undefined;
	return {
		watch: (next) => {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
		fire: (error) => listener?.(error),
		watching: () => listener !== undefined,
	};
}

Deno.test("runSuite() gives each file a fresh harness and keeps going after a load failure", async () => {
	// Given: three files, the middle one throwing while it loads
	const { install, test } = installer();
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
	const { files: reports, uncaught } = await runSuite({
		files,
		install,
		watch: manualWatch().watch,
	});

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
	assertEquals(uncaught, []);
});

Deno.test("runSuite() records each uncaught error against what was running", async () => {
	// Given: errors surfacing while a file loads, during a test, from a timer
	// a test left behind, and between files
	const { install, test } = installer();
	const { watch, fire, watching } = manualWatch();
	const files = [
		{
			package: "a",
			path: "packages/a/one.test.ts",
			load: () => {
				fire("while loading");
				test("busy", () => fire("during busy"));
				return Promise.resolve();
			},
		},
		{
			package: "b",
			path: "packages/b/two.test.ts",
			load: () => {
				test("leaves a timer", () => {
					setTimeout(() => fire("from the timer"), 0);
				});
				test("after", () => {});
				return Promise.resolve();
			},
		},
	];

	// When: the suite runs
	const { uncaught } = await runSuite({ files, install, watch });

	// Then: each error names its file, and its test when one was running;
	// the timer's error surfaces before the file ends, and the watch is removed
	assertEquals(uncaught, [
		{
			scope: { kind: "file", path: "packages/a/one.test.ts" },
			error: "while loading",
		},
		{
			scope: { kind: "test", path: "packages/a/one.test.ts", test: "busy" },
			error: "during busy",
		},
		{
			scope: { kind: "file", path: "packages/b/two.test.ts" },
			error: "from the timer",
		},
	]);
	assertEquals(watching(), false);
});

Deno.test("runSuite() scopes an error outside every file to the run", async () => {
	// Given: a watch that fires as soon as it is installed, before any file
	const { install } = installer();
	const watch = (listener: UncaughtListener): Unwatch => {
		listener(new Error("early"));
		return () => {};
	};

	// When: an empty suite runs
	const { uncaught } = await runSuite({ files: [], install, watch });

	// Then: the error belongs to the run
	assertEquals(
		uncaught.map((entry) => entry.scope),
		[{ kind: "run" }],
	);
	assertMatch(uncaught[0]?.error ?? "", /^Error: early/);
});
