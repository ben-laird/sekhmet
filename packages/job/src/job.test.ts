import { defineJobs, type Job, type JobRun, skip } from "@sekhmet/job";
import { assertType, type IsExact } from "@std/testing/types";

interface Ctx {
	readonly release: boolean;
}

const { job } = defineJobs<Ctx>();
const version = job({ name: "version", run: () => "1.2.0" });
const build = job({
	name: "build",
	run: () => ({ outDir: "dist", files: ["mod.js"] }),
});

Deno.test("job infers what its run returns", () => {
	// Given: jobs defined with no annotations
	// When: their types are read
	// Then: each is a Job of what its run returns, in the defined context
	assertType<IsExact<typeof version, Job<string, Ctx>>>(true);
	assertType<
		IsExact<typeof build, Job<{ outDir: string; files: string[] }, Ctx>>
	>(true);
});

Deno.test("run's plan parameter is inferred from plan's return", async (t) => {
	await t.step("handles resolve to Readonly values, data passes as is", () => {
		// Given: a plan returning handles and data, with no annotations
		// When: run destructures its second parameter
		// Then: each handle arrives as its job's Readonly result
		job({
			name: "publish",
			plan: (p) => ({ version: p.needs(version), build: p.needs(build), n: 1 }),
			run: (_t, plan) => {
				assertType<
					IsExact<
						typeof plan,
						{
							readonly version: string;
							readonly build: Readonly<{ outDir: string; files: string[] }>;
							readonly n: number;
						}
					>
				>(true);
			},
		});
	});

	await t.step("Handle<T> | undefined arrives as T | undefined", () => {
		// Given: a plan that needs a job only on a condition
		// When: run receives it
		// Then: the field is the result or undefined
		job({
			name: "sign",
			plan: (p) => ({ build: p.context.release ? p.needs(build) : undefined }),
			run: (_t, { build }) => {
				assertType<
					IsExact<
						typeof build,
						Readonly<{ outDir: string; files: string[] }> | undefined
					>
				>(true);
			},
		});
	});

	await t.step("a staged async plan infers the same way", () => {
		// Given: an async plan that awaits a result before declaring needs
		// When: run receives the plan
		// Then: the awaited value is data, the handle is resolved
		job({
			name: "staged",
			plan: async (p) => {
				const v = await p.result(version);
				return { v, build: p.needs(build) };
			},
			run: (_t, { v, build }) => {
				assertType<IsExact<typeof v, string>>(true);
				assertType<
					IsExact<typeof build, Readonly<{ outDir: string; files: string[] }>>
				>(true);
			},
		});
	});

	await t.step("skip() is excluded from what run receives", () => {
		// Given: a plan that may skip
		// When: run receives the plan
		// Then: Skip is not part of its type
		job({
			name: "maybe",
			plan: (p) => (p.context.release ? { build: p.needs(build) } : skip()),
			run: (_t, plan) => {
				assertType<
					IsExact<
						typeof plan,
						{ readonly build: Readonly<{ outDir: string; files: string[] }> }
					>
				>(true);
			},
		});
	});

	await t.step("a leaf job's run takes only t", () => {
		// Given: a job with no plan
		// When: its run is typed
		// Then: t is the run's tools in the defined context
		job({
			name: "leaf",
			run: (t) => {
				assertType<IsExact<typeof t, JobRun<Ctx>>>(true);
			},
		});
	});
});

Deno.test("resolved plans are Readonly", () => {
	// Given: a plan with a handle
	job({
		name: "mutator",
		plan: (p) => ({ build: p.needs(build) }),
		run: (_t, plan) => {
			// When / Then: neither the plan nor a shared result can be reassigned
			// @ts-expect-error the plan is Readonly
			plan.build = { outDir: "x", files: [] };
			// @ts-expect-error a shared result is Readonly
			plan.build.outDir = "elsewhere";
		},
	});
});

Deno.test("jobs from another context are rejected", () => {
	// Given: a job defined for a different context
	const other = defineJobs<{ readonly token: string }>().job({
		name: "other",
		run: () => 1,
	});

	// When / Then: a plan in Ctx cannot need it
	job({
		name: "mixer",
		// @ts-expect-error Job<number, { token }> is not a Job in Ctx
		plan: (p) => ({ n: p.needs(other) }),
		run: () => {},
	});
});

Deno.test("Job is covariant in its result, contravariant in its context", () => {
	// Given: jobs of narrow and wide types
	const narrow: Job<"a", Ctx> = job({ name: "a", run: () => "a" as const });
	const wide: Job<string, Ctx> = version;
	const loose = defineJobs<object>().job({ name: "loose", run: () => "x" });

	// When: each is assigned to the other's type
	// Then: a narrower result widens, and a wider one does not narrow
	const widened: Job<string, Ctx> = narrow;
	// @ts-expect-error a Job<string> is not a Job<"a">
	const narrowed: Job<"a", Ctx> = wide;

	// Then: a job that reads less of the context runs in a richer one, not back
	const richer: Job<string, Ctx> = loose;
	// @ts-expect-error a job reading Ctx can't run with any object
	const poorer: Job<string, object> = wide;

	// Then: the checks hold in the other order too
	// @ts-expect-error narrowing still rejected after widening was checked
	const narrowedAgain: Job<"a", Ctx> = widened;
	const widenedAgain: Job<unknown, Ctx> = narrowed;
	void [richer, poorer, narrowedAgain, widenedAgain];
});

Deno.test("a plan must be a plain object with string keys", () => {
	// Given: a symbol, and the shapes that resolution can't walk
	const key = Symbol("key");

	// When / Then: tuples, arrays, Maps, class instances and symbol keys are rejected
	// @ts-expect-error a tuple is not a plan record
	job({ name: "tuple", plan: (p) => [p.needs(build)] as const, run: () => {} });
	// @ts-expect-error an array is not a plan record
	job({ name: "array", plan: () => [1, 2], run: () => {} });
	// @ts-expect-error a Map is not a plan record
	job({ name: "map", plan: () => new Map<string, number>(), run: () => {} });
	// @ts-expect-error a class instance is not a plan record
	job({ name: "date", plan: () => new Date(), run: () => {} });
	job({
		name: "symbol",
		// @ts-expect-error a symbol key would never be resolved
		plan: (p) => ({ [key]: p.needs(build) }),
		run: () => {},
	});

	// Then: object literals, empty plans and skip-only plans are accepted
	job({
		name: "record",
		plan: (p) => ({ build: p.needs(build) }),
		run: () => {},
	});
	job({ name: "empty", plan: () => ({}), run: () => {} });
	job({ name: "skipping", plan: () => skip(), run: () => {} });
});
