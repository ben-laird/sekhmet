import {
	always,
	defineJobs,
	type Job,
	type JobOutcome,
	type Need,
	succeeded,
} from "@sekhmet/job";
import { assertType, type IsExact } from "@std/testing/types";

interface Ctx {
	readonly release: boolean;
}

type Build = { outDir: string; files: string[] };

const { job } = defineJobs<Ctx>();
const version = job({ name: "version", run: () => "1.2.0" });
const build = job({
	name: "build",
	run: (): Build => ({ outDir: "dist", files: ["mod.js"] }),
});

Deno.test("job infers what its run returns", () => {
	// Given: jobs defined with no plan type annotations
	// When: their types are read
	// Then: each is a Job of what its run returns, in the defined context
	assertType<IsExact<typeof version, Job<string, Ctx>>>(true);
	assertType<IsExact<typeof build, Job<Build, Ctx>>>(true);
});

Deno.test("run's needs are typed by the plan and the runIf", async (t) => {
	await t.step("under success(), needs arrive as Readonly values", () => {
		// Given: a plan returning needs and data
		// When: run receives it
		// Then: each need is its job's Readonly result, data as is
		job({
			name: "publish",
			plan: (p) => ({ version: p.needs(version), build: p.needs(build), n: 1 }),
			run: (_t, needs) => {
				assertType<
					IsExact<
						typeof needs,
						{
							readonly version: string;
							readonly build: Readonly<Build>;
							readonly n: number;
						}
					>
				>(true);
			},
		});
	});

	await t.step("under any other runIf, needs arrive as outcomes", () => {
		// Given: an always() job
		// When: run receives its needs
		// Then: each is the job's JobOutcome
		job({
			name: "cleanup",
			plan: (p) => ({ build: p.needs(build) }),
			runIf: always(),
			run: (_t, { build }) => {
				assertType<IsExact<typeof build, JobOutcome<Readonly<Build>>>>(true);
			},
		});
	});

	await t.step("a needsIf may be absent", () => {
		// Given: a conditional need
		// When: run receives it
		// Then: it is the value or undefined
		job({
			name: "sign",
			plan: (p) => {
				const built = p.needs(build);
				return {
					built,
					version: p.needsIf({ job: version, when: succeeded(built) }),
				};
			},
			run: (_t, { version }) => {
				assertType<IsExact<typeof version, string | undefined>>(true);
			},
		});
	});

	await t.step(
		"needs nested in arrays and records resolve at any depth",
		() => {
			// Given: needs in an array of records, and a function beside them
			// When: run receives them
			// Then: each need is resolved in place, and the function is kept
			job({
				name: "matrix",
				plan: (p) => {
					return {
						rows: [{ label: "v", value: p.needs(version) }],
						format: (text: string) => text.toUpperCase(),
					};
				},
				run: (_t, { rows, format }) => {
					assertType<
						IsExact<
							typeof rows,
							readonly { readonly label: string; readonly value: string }[]
						>
					>(true);
					assertType<IsExact<typeof format, (text: string) => string>>(true);
				},
			});
		},
	);

	await t.step("a job without a plan takes only t", () => {
		// Given: a leaf job
		// When: its run is read
		// Then: it needs no second parameter
		job({
			name: "leaf",
			run: (t) => {
				assertType<IsExact<typeof t.context, Ctx>>(true);
			},
		});
	});
});

Deno.test("a hand-written runIf reads the context and the needs' outcomes", () => {
	// Given: a predicate runIf
	// When: it is typed
	// Then: it gets the context, the cancel flag and outcomes
	job({
		name: "report",
		plan: (p) => ({ build: p.needs(build) }),
		runIf: ({ context, cancelled, needs }) => {
			assertType<IsExact<typeof needs.build, JobOutcome<Readonly<Build>>>>(
				true,
			);
			return context.release && !cancelled;
		},
		run: () => {},
	});
});

Deno.test("resolved needs are Readonly", () => {
	// Given: a plan with a need
	job({
		name: "mutator",
		plan: (p) => ({ build: p.needs(build) }),
		run: (_t, needs) => {
			// When / Then: neither the needs nor a shared result can be reassigned
			// @ts-expect-error the needs are Readonly
			needs.build = { outDir: "x", files: [] };
			// @ts-expect-error a shared result is Readonly
			needs.build.outDir = "elsewhere";
		},
	});
});

Deno.test("p.needs returns a Need typed by the job", () => {
	// Given: a plan
	job({
		name: "typed",
		plan: (p) => {
			// When: it declares needs
			const plain = p.needs(version);
			const guarded = p.needsIf({ job: version, when: succeeded(plain) });

			// Then: each Need carries the job's type and whether it's conditional
			assertType<IsExact<typeof plain, Need<string, false>>>(true);
			assertType<IsExact<typeof guarded, Need<string, true>>>(true);
			return { plain, guarded };
		},
		run: () => {},
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
	void [widened, narrowed, richer, poorer];
});

Deno.test("a success() job can't take a non-success runIf's outcome type", () => {
	// Given: a default job
	job({
		name: "strict",
		plan: (p) => ({ build: p.needs(build) }),
		// When / Then: treating a value as an outcome is a type error
		// @ts-expect-error under success(), build is a value, not an outcome
		run: (_t, { build }) => build.isSucceeded(),
	});
});
