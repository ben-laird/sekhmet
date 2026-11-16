import { assertEquals } from "@std/assert";
import { type Load, runProbe } from "@/probe/probe.ts";

function load(
	specifier: string,
	result: () => Promise<Record<string, unknown>>,
): Load {
	return { package: "@sekhmet/demo", specifier, load: result };
}

Deno.test("runProbe records every load and exercise without throwing", async () => {
	// Given: one loading path, one failing path and a passing exercise
	const loads = [
		load("@sekhmet/demo", () => Promise.resolve({ a: 1, b: 2 })),
		load("@sekhmet/demo/broken", () =>
			Promise.reject(new TypeError("missing export")),
		),
	];
	const exercises = {
		"@sekhmet/demo": () => Promise.resolve({ exercise: () => {} }),
	};

	// When: the probe runs
	const report = await runProbe({ loads, exercises });

	// Then: each outcome is recorded in order
	assertEquals(report.loads, [
		{
			package: "@sekhmet/demo",
			specifier: "@sekhmet/demo",
			ok: true,
			exports: 2,
		},
		{
			package: "@sekhmet/demo",
			specifier: "@sekhmet/demo/broken",
			ok: false,
			error: "TypeError: missing export",
		},
	]);
	assertEquals(report.exercises, [{ package: "@sekhmet/demo", ok: true }]);
});

Deno.test("runProbe fails an exercise that throws, rejects or is missing", async (t) => {
	await t.step("a throwing exercise", async () => {
		// Given: an exercise that throws a non-Error
		const exercises = {
			"@sekhmet/demo": () =>
				Promise.resolve({
					exercise: () => {
						throw "plain string";
					},
				}),
		};

		// When: the probe runs
		const report = await runProbe({
			loads: [load("@sekhmet/demo", () => Promise.resolve({}))],
			exercises,
		});

		// Then: the thrown value is recorded
		assertEquals(report.exercises, [
			{ package: "@sekhmet/demo", ok: false, error: "plain string" },
		]);
	});

	await t.step("an exercise module that fails to load", async () => {
		// Given: an exercise whose module cannot be imported
		const exercises = {
			"@sekhmet/demo": () => Promise.reject(new Error("no module")),
		};

		// When: the probe runs
		const report = await runProbe({
			loads: [load("@sekhmet/demo", () => Promise.resolve({}))],
			exercises,
		});

		// Then: the exercise fails with that error
		assertEquals(report.exercises, [
			{ package: "@sekhmet/demo", ok: false, error: "Error: no module" },
		]);
	});

	await t.step("a package with no exercise", async () => {
		// Given: no exercises at all

		// When: the probe runs
		const report = await runProbe({
			loads: [load("@sekhmet/demo", () => Promise.resolve({}))],
			exercises: {},
		});

		// Then: the gap is a failure
		assertEquals(report.exercises, [
			{
				package: "@sekhmet/demo",
				ok: false,
				error: "no exercise is defined for @sekhmet/demo",
			},
		]);
	});
});

Deno.test("runProbe names the runtime it ran on", async () => {
	// Given: no work

	// When: the probe runs under Deno
	const report = await runProbe({ loads: [], exercises: {} });

	// Then: Deno is named, not the Node version it emulates
	assertEquals(report.runtime, `deno ${Deno.version.deno}`);
});
