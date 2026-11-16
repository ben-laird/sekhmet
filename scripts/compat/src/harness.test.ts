import { assertEquals, assertMatch, assertThrows } from "@std/assert";
import {
	createHarness,
	describeError,
	normalizeDefinition,
	type TestContext,
} from "./harness.ts";

const noop = (): void => {};

Deno.test("normalizeDefinition() accepts every Deno.test call form", async (t) => {
	await t.step("(name, fn)", () => {
		// Given/When: a name and a function
		const definition = normalizeDefinition(["adds", noop]);

		// Then: both are taken as given, with no flags
		assertEquals(definition, {
			name: "adds",
			fn: noop,
			ignore: false,
			only: false,
		});
	});

	await t.step("(name, options, fn)", () => {
		// Given/When: a name, options and a function
		const definition = normalizeDefinition(["adds", { ignore: true }, noop]);

		// Then: the options' flags apply
		assertEquals(definition, {
			name: "adds",
			fn: noop,
			ignore: true,
			only: false,
		});
	});

	await t.step("(options) and (options, fn)", () => {
		// Given/When: options carrying the function, and options beside it
		const inline = normalizeDefinition([{ name: "a", fn: noop, only: true }]);
		const beside = normalizeDefinition([{ name: "b" }, noop]);

		// Then: both resolve the name and function
		assertEquals(inline, { name: "a", fn: noop, ignore: false, only: true });
		assertEquals(beside, { name: "b", fn: noop, ignore: false, only: false });
	});

	await t.step("(fn) takes the function's name", () => {
		// Given: a named function
		function namedTest(): void {}

		// When: it is registered alone
		const definition = normalizeDefinition([namedTest]);

		// Then: its name is the test name
		assertEquals(definition.name, "namedTest");
	});

	await t.step("a malformed call panics", () => {
		// Given/When/Then: a call with no function, or no name, throws
		assertThrows(() => normalizeDefinition(["no fn"]), TypeError);
		assertThrows(() => normalizeDefinition([() => {}]), TypeError);
		assertThrows(() => normalizeDefinition([42]), TypeError);
	});
});

Deno.test("describeError() keeps the message when the stack omits it", () => {
	// Given: an error whose stack lacks its message, as in Firefox and WebKit
	const error = new Error("boom");
	error.stack = "at f (file.js:1:1)";

	// When: it is described
	const description = describeError(error);

	// Then: the headline comes first, then the stack
	assertEquals(description, "Error: boom\nat f (file.js:1:1)");
});

Deno.test("describeError() uses a V8 stack as is, and stringifies non-errors", () => {
	// Given: a V8 error, whose stack starts with its message, and a thrown string
	const error = new RangeError("out");

	// When/Then: the stack is the description, and the string is itself
	assertEquals(describeError(error), error.stack);
	assertEquals(describeError("plain"), "plain");
});

Deno.test("a harness runs tests in registration order and reports outcomes", async () => {
	// Given: a passing, a failing, an async and an ignored test
	const harness = createHarness();
	const order: string[] = [];
	harness.test("passes", () => {
		order.push("passes");
	});
	harness.test("fails", () => {
		order.push("fails");
		throw new Error("nope");
	});
	harness.test("async", async () => {
		await Promise.resolve();
		order.push("async");
	});
	harness.test({
		name: "skipped",
		ignore: true,
		fn: () => order.push("skipped"),
	});

	// When: it runs
	const { tests, usedOnly } = await harness.run();

	// Then: every test ran in order except the ignored one
	assertEquals(order, ["passes", "fails", "async"]);
	assertEquals(
		tests.map((test) => [test.name, test.outcome.kind]),
		[
			["passes", "passed"],
			["fails", "failed"],
			["async", "passed"],
			["skipped", "ignored"],
		],
	);
	assertEquals(usedOnly, false);
	const failed = tests[1]?.outcome;
	assertMatch(failed?.kind === "failed" ? failed.error : "", /Error: nope/);
});

Deno.test("only runs the tests that set it and flags the run", async () => {
	// Given: one test marked only beside a plain one
	const harness = createHarness();
	harness.test("plain", noop);
	harness.test({ name: "focused", only: true, fn: noop });

	// When: it runs
	const { tests, usedOnly } = await harness.run();

	// Then: the plain test is ignored and the run reports `only`
	assertEquals(
		tests.map((test) => test.outcome.kind),
		["ignored", "passed"],
	);
	assertEquals(usedOnly, true);
});

Deno.test("t.step nests steps and fails the parent of a failing step", async (t) => {
	await t.step("nested steps are reported under their parent", async () => {
		// Given: a test with a passing step holding a nested step
		const harness = createHarness();
		const results: boolean[] = [];
		harness.test("outer", async (ctx: TestContext) => {
			results.push(
				await ctx.step("inner", async (inner: TestContext) => {
					results.push(await inner.step("innermost", noop));
				}),
			);
		});

		// When: it runs
		const { tests } = await harness.run();

		// Then: the tree is reported and each step resolved true
		assertEquals(tests, [
			{
				name: "outer",
				outcome: { kind: "passed" },
				steps: [
					{
						name: "inner",
						outcome: { kind: "passed" },
						steps: [
							{ name: "innermost", outcome: { kind: "passed" }, steps: [] },
						],
					},
				],
			},
		]);
		assertEquals(results, [true, true]);
	});

	await t.step(
		"a failing step fails its parent and resolves false",
		async () => {
			// Given: a test whose step throws, but which swallows nothing itself
			const harness = createHarness();
			let resolved: boolean | undefined;
			harness.test("outer", async (ctx: TestContext) => {
				resolved = await ctx.step("bad", () => {
					throw new Error("step broke");
				});
			});

			// When: it runs
			const { tests } = await harness.run();

			// Then: the step failed, the parent failed with it, and step() gave false
			assertEquals(resolved, false);
			assertEquals(tests[0]?.outcome, {
				kind: "failed",
				error: "1 step(s) failed",
			});
			assertEquals(tests[0]?.steps[0]?.outcome.kind, "failed");
		},
	);

	await t.step(
		"an ignored step is reported ignored and resolves false",
		async () => {
			// Given: a test with an ignored step
			const harness = createHarness();
			let resolved: boolean | undefined;
			harness.test("outer", async (ctx: TestContext) => {
				resolved = await ctx.step({ name: "later", ignore: true, fn: noop });
			});

			// When: it runs
			const { tests } = await harness.run();

			// Then: the parent passes and the step is ignored
			assertEquals(resolved, false);
			assertEquals(tests[0]?.outcome, { kind: "passed" });
			assertEquals(tests[0]?.steps[0]?.outcome, { kind: "ignored" });
		},
	);

	await t.step("an un-awaited step fails its parent", async () => {
		// Given: a test that starts a slow step without awaiting it
		const harness = createHarness();
		const { promise, resolve } = Promise.withResolvers<void>();
		harness.test("outer", (ctx: TestContext) => {
			void ctx.step("slow", () => promise);
		});

		// When: it runs
		const { tests } = await harness.run();
		resolve();

		// Then: the parent fails for the dangling step
		assertEquals(tests[0]?.outcome, {
			kind: "failed",
			error: "1 step(s) were not awaited before the test ended",
		});
	});
});
