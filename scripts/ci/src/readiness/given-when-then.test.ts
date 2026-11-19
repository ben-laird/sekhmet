import { assertEquals } from "@std/assert";
import {
	checkGivenWhenThen,
	markerComments,
	testBlocks,
} from "./given-when-then.ts";
import { sourceViews } from "./source.ts";

function check(text: string): string[] {
	return checkGivenWhenThen({
		path: "a.test.ts",
		text,
		views: sourceViews(text),
	}).map(({ line, message }) => `${line}: ${message}`);
}

Deno.test("checkGivenWhenThen passes a test with all three markers", () => {
	// Given: a test with Given, When and Then
	const text = `Deno.test("adds", () => {
	// Given: two numbers
	// When: adding them
	// Then: the sum is right
});`;

	// When: checking it
	const findings = check(text);

	// Then: there is nothing to report
	assertEquals(findings, []);
});

Deno.test("checkGivenWhenThen reports the missing markers of a test on its line", () => {
	// Given: a second test that only has a Given
	const text = `Deno.test("ok", () => {
	// Given: a
	// When: b
	// Then: c
});
Deno.test("bare", () => {
	// Given: only this
});`;

	// When: checking the file
	const findings = check(text);

	// Then: the bare test is reported with what it lacks
	assertEquals(findings, [
		'6: Deno.test "bare" is missing // When:, // Then: comments',
	]);
});

Deno.test("checkGivenWhenThen lets steps inherit a test's Given and covers the test through its steps", () => {
	// Given: a test with shared setup and steps that each have When and Then
	const text = `Deno.test("suite", async (t) => {
	// Given: shared setup
	await t.step("one", () => {
		// When: a
		// Then: b
	});
	await t.step("two", () => {
		// When/Then: combined
	});
});`;

	// When: checking it
	const findings = check(text);

	// Then: the test and both steps are covered
	assertEquals(findings, []);
});

Deno.test("checkGivenWhenThen never lets a step borrow a sibling's markers", () => {
	// Given: a step without When/Then next to one that has them
	const text = `Deno.test("suite", async (t) => {
	// Given: shared setup
	await t.step("covered", () => {
		// When: a
		// Then: b
	});
	await t.step("bare", () => {
		doSomething();
	});
});`;

	// When: checking it
	const findings = check(text);

	// Then: only the bare step is reported, not its parent test
	assertEquals(findings, [
		'7: t.step "bare" is missing // When:, // Then: comments',
	]);
});

Deno.test("checkGivenWhenThen ignores markers outside a test and prose that starts with a marker word", () => {
	// Given: a file-level Given and a When that is prose, not a marker
	const text = `// Given: file-level fixtures
Deno.test("prose", () => {
	// Then: something
	// When the queue drains, it stops
});`;

	// When: checking it
	const findings = check(text);

	// Then: the test still lacks Given and When
	assertEquals(findings, [
		'2: Deno.test "prose" is missing // Given:, // When: comments',
	]);
});

Deno.test("testBlocks ignores test-like text in strings and comments, and non-test .step() calls", () => {
	// Given: a real test, a string and a comment mentioning Deno.test, and a
	// scheduler.step() call with no name
	const text = `const s = "Deno.test(";
// Deno.test("commented", () => {});
Deno.test("real", () => {
	scheduler.step();
});`;

	// When: finding test blocks
	const blocks = testBlocks(sourceViews(text));

	// Then: only the real test is found, with no steps
	assertEquals(
		blocks.map(({ name, children }) => [name, children.length]),
		[["real", 0]],
	);
});

Deno.test("checkGivenWhenThen ignores a .step() call that isn't on a test context", () => {
	// Given: a job's run body calling r.step at module level, and one calling
	// x.step inside a test whose own context is unused
	const text = `const job = define({
	run: async (r) => {
		await r.step({ name: "setup", run: () => {} });
	},
});
Deno.test("runs", async () => {
	// Given: a job
	// When: it runs
	// Then: it works
	await define({
		run: async (x) => {
			await x.step({ name: "inner", run: () => {} });
		},
	});
});`;

	// When: checking it and finding its blocks
	const findings = check(text);
	const blocks = testBlocks(sourceViews(text));

	// Then: neither step call is a test step, so nothing is reported
	assertEquals(findings, []);
	assertEquals(
		blocks.map(({ name, children }) => [name, children.length]),
		[["runs", 0]],
	);
});

Deno.test("checkGivenWhenThen ignores a .step() on a name that shadows the test context", () => {
	// Given: a test whose context is t, and a job body that rebinds t
	const text = `Deno.test("shadow", async (t) => {
	// Given: a job
	// When: it runs
	// Then: it works
	await define({
		run: async (t) => {
			await t.step({ name: "inner", run: () => {} });
		},
	});
});`;

	// When: finding its blocks
	const blocks = testBlocks(sourceViews(text));

	// Then: the rebound t's step isn't a test step
	assertEquals(
		blocks.map(({ name, children }) => [name, children.length]),
		[["shadow", 0]],
	);
});

Deno.test("checkGivenWhenThen still requires markers on steps of the test context, whatever it's named", () => {
	// Given: a step on t, and a nested step on a renamed context, both bare
	const text = `Deno.test("suite", async (t) => {
	// Given: shared setup
	await t.step("outer", async (ctx) => {
		await ctx.step({
			name: "inner",
			fn: () => {
				doSomething();
			},
		});
	});
	await t.step("bare", () => {
		doSomething();
	});
});
Deno.test({
	name: "options",
	fn: async (context) => {
		// Given: setup
		await context.step("renamed", () => {
			doSomething();
		});
	},
});`;

	// When: checking it
	const findings = check(text);

	// Then: every bare step is reported, the renamed contexts' included
	assertEquals(findings, [
		"4: t.step is missing // When:, // Then: comments",
		'11: t.step "bare" is missing // When:, // Then: comments',
		'19: t.step "renamed" is missing // When:, // Then: comments',
	]);
});

Deno.test("markerComments reads bare and combined markers", () => {
	// Given: a bare Given, a combined When/Then and a prose comment
	const text = "// Given\n// When/Then: both\n// note: Then";

	// When: reading the markers
	const markers = markerComments(sourceViews(text)).map((m) => m.markers);

	// Then: the first two count, the prose does not
	assertEquals(markers, [["Given"], ["When", "Then"]]);
});
