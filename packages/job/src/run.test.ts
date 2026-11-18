import { isolate, match, union } from "@sekhmet/enum/core/mini";
import {
	isErr,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import {
	Blocked,
	Cancelled,
	Cycle,
	DuplicateName,
	defineJobs,
	type GraphError,
	type Job,
	type JobEvent,
	type JobOutcome,
	type RunOptions,
	type RunReport,
	runJobs,
	Skipped,
	Succeeded,
	skip,
} from "@sekhmet/job";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";

const { job } = defineJobs<null>();

/** Runs `jobs` with a null context, failing the test if it takes over 2s. */
async function run({
	events,
	...options
}: Omit<RunOptions<null>, "context" | "onEvent"> & {
	events?: string[];
}): Promise<Result<RunReport, GraphError>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("run did not settle")), 2000);
	});
	try {
		return await Promise.race([
			runJobs({
				...options,
				context: null,
				onEvent: (event) => events?.push(describe(event)),
			}),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** One line per event, so a test can compare the whole sequence. */
function describe(event: JobEvent): string {
	return match(event)({
		Started: ({ job }) => `Started ${job}`,
		StepStarted: ({ job, step }) => `StepStarted ${job}/${step}`,
		StepFinished: ({ job, step, result }) => {
			return `StepFinished ${job}/${step} ${isErr(result) ? "Err" : "Ok"}`;
		},
		Finished: ({ job, outcome }) => `Finished ${job} ${kind(outcome)}`,
		Skipped: ({ job }) => `Skipped ${job}`,
		Blocked: ({ job, blockedBy }) => `Blocked ${job} by ${blockedBy.join(",")}`,
		Cancelled: ({ job }) => `Cancelled ${job}`,
	});
}

function kind(outcome: JobOutcome<unknown>): string {
	return match(outcome)({
		Succeeded: () => "Succeeded",
		Failed: () => "Failed",
		Skipped: () => "Skipped",
		Blocked: () => "Blocked",
		Cancelled: () => "Cancelled",
	});
}

function outcomeOf({
	report,
	name,
}: {
	report: RunReport;
	name: string;
}): JobOutcome<unknown> {
	const outcome = report.outcomes.get(name);
	assert(outcome !== undefined, `no outcome for ${name}`);
	return outcome;
}

/** Resolves when `signal` aborts; a body that honours cancellation. */
function untilAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}

Deno.test("each job runs once per run, at any depth", async () => {
	// Given: a diamond, base <- left, right <- top, plus a deeper edge to base
	let calls = 0;
	const base = job({
		name: "base",
		run: () => {
			calls += 1;
			return { n: 1 };
		},
	});
	const left = job({
		name: "left",
		plan: (p) => ({ base: p.needs(base) }),
		run: () => "l",
	});
	const right = job({
		name: "right",
		plan: (p) => ({ left: p.needs(left), base: p.needs(base) }),
		run: () => "r",
	});
	const top = job({
		name: "top",
		plan: (p) => ({ left: p.needs(left), right: p.needs(right) }),
		run: (_t, { left, right }) => left + right,
	});

	// When: running from two roots that share the graph
	const report = unwrap(await run({ jobs: [top, right] }));

	// Then: base ran once, and every job reports
	assertEquals(calls, 1);
	assertEquals(outcomeOf({ report, name: "top" }), Succeeded("lr"));
	assertEquals([...report.outcomes.keys()].sort(), [
		"base",
		"left",
		"right",
		"top",
	]);

	// When: the same jobs run again
	unwrap(await run({ jobs: [top] }));

	// Then: a separate run is independent, so base runs again
	assertEquals(calls, 2);
});

Deno.test("every dependent receives the same result object", async () => {
	// Given: two jobs that need one shared result
	const seen: object[] = [];
	const config = job({ name: "config", run: () => ({ mode: "ci" }) });
	const a = job({
		name: "a",
		plan: (p) => ({ config: p.needs(config) }),
		run: (_t, { config }) => void seen.push(config),
	});
	const b = job({
		name: "b",
		plan: (p) => ({ config: p.needs(config) }),
		run: (_t, { config }) => void seen.push(config),
	});

	// When: both run
	unwrap(await run({ jobs: [a, b] }));

	// Then: they saw the identical object
	assertEquals(seen.length, 2);
	assert(seen[0] === seen[1]);
});

Deno.test("a failed need blocks its dependents, transitively", async () => {
	// Given: lint fails; test needs lint; report needs test; docs is unrelated
	let started = false;
	const lint = job({
		name: "lint",
		run: () => {
			throw new Error("unused variable");
		},
	});
	const test = job({
		name: "test",
		plan: (p) => ({ lint: p.needs(lint) }),
		run: () => {
			started = true;
		},
	});
	const report = job({
		name: "report",
		plan: (p) => ({ test: p.needs(test) }),
		run: () => {},
	});
	const docs = job({ name: "docs", run: () => "built" });

	// When: running them
	const result = unwrap(await run({ jobs: [report, docs] }));

	// Then: the failure is a value, never rethrown
	const lintOutcome = outcomeOf({ report: result, name: "lint" });
	assert(isolate(lintOutcome, "Failed"));
	const lintError = union(lintOutcome);
	assertInstanceOf(lintError, Error);
	assertEquals(lintError.message, "unused variable");

	// Then: blocking propagates, each naming its own need, and no body started
	assertEquals(outcomeOf({ report: result, name: "test" }), Blocked(["lint"]));
	assertEquals(
		outcomeOf({ report: result, name: "report" }),
		Blocked(["test"]),
	);
	assertEquals(started, false);

	// Then: the unrelated sibling kept running, and the run failed
	assertEquals(outcomeOf({ report: result, name: "docs" }), Succeeded("built"));
	assertEquals(result.passed, false);
});

Deno.test("Blocked names every unhealthy need, in declaration order", async () => {
	// Given: a job needing two failures and a success
	const fails = (name: string) => {
		return job({ name, run: () => Promise.reject(new Error(name)) });
	};
	const ok = job({ name: "ok", run: () => 1 });
	const [x, y] = [fails("x"), fails("y")];
	const both = job({
		name: "both",
		plan: (p) => ({ y: p.needs(y), ok: p.needs(ok), x: p.needs(x) }),
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [both] }));

	// Then: a rejection is Failed too, and both blockers are named in order
	assert(isolate(outcomeOf({ report, name: "x" }), "Failed"));
	assertEquals(outcomeOf({ report, name: "both" }), Blocked(["y", "x"]));
});

Deno.test("a plan that throws fails its job", async () => {
	// Given: a plan that throws
	const broken = job({
		name: "broken",
		plan: (): { n: number } => {
			throw new Error("bad plan");
		},
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [broken] }));

	// Then: the job Failed with the plan's error
	const outcome = outcomeOf({ report, name: "broken" });
	assert(isolate(outcome, "Failed"));
	const error = union(outcome);
	assertInstanceOf(error, Error);
	assertEquals(error.message, "bad plan");
});

Deno.test("skip() skips the job and the jobs that need it", async () => {
	// Given: a plan that skips, and a dependent
	const deploy = job({
		name: "deploy",
		plan: () => skip(),
		run: () => "deployed",
	});
	const announce = job({
		name: "announce",
		plan: (p) => ({ deploy: p.needs(deploy) }),
		run: () => {},
	});

	// When: they run
	const report = unwrap(await run({ jobs: [announce] }));

	// Then: both are Skipped, and a skip doesn't fail the run
	assertEquals(outcomeOf({ report, name: "deploy" }), Skipped());
	assertEquals(outcomeOf({ report, name: "announce" }), Skipped());
	assert(report.passed);
});

Deno.test("a staged plan decides its needs from a result", async (t) => {
	// Given: version decides whether publish needs sign
	let signed = false;
	const sign = job({
		name: "sign",
		run: () => {
			signed = true;
			return "sig";
		},
	});
	const publishFor = (v: string) => {
		const version = job({ name: "version", run: () => v });
		return job({
			name: "publish",
			plan: async (p) => {
				const version_ = await p.result(version);
				return {
					version: version_,
					sign: version_.startsWith("0.") ? undefined : p.needs(sign),
				};
			},
			run: (_t, { version, sign }) => `${version} ${sign ?? "unsigned"}`,
		});
	};

	await t.step("a 0.x version needs no signature", async () => {
		// When: publishing 0.3.0
		const report = unwrap(await run({ jobs: [publishFor("0.3.0")] }));

		// Then: sign was never reached
		assertEquals(
			outcomeOf({ report, name: "publish" }),
			Succeeded("0.3.0 unsigned"),
		);
		assertEquals(report.outcomes.has("sign"), false);
		assertEquals(signed, false);
	});

	await t.step("a 1.x version needs one", async () => {
		// When: publishing 1.0.0
		const report = unwrap(await run({ jobs: [publishFor("1.0.0")] }));

		// Then: sign ran first and its result arrived
		assertEquals(
			outcomeOf({ report, name: "publish" }),
			Succeeded("1.0.0 sig"),
		);
		assertEquals(signed, true);
	});
});

Deno.test("awaiting a result that fails blocks the plan's job", async () => {
	// Given: a plan that awaits a failing job's result
	let resumed = false;
	const version = job({
		name: "version",
		run: () => {
			throw new Error("no tags");
		},
	});
	const publish = job({
		name: "publish",
		plan: async (p) => {
			await p.result(version);
			resumed = true;
			return {};
		},
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [publish] }));

	// Then: the plan never resumed, and the job is Blocked by version
	assertEquals(outcomeOf({ report, name: "publish" }), Blocked(["version"]));
	assertEquals(resumed, false);
});

Deno.test("p.outcome never blocks: failure() and always() are plans", async () => {
	// Given: notify runs only on failure, cleanup always
	const notifyFor = (build: Job<string, null>) => {
		return job({
			name: "notify",
			plan: async (p) => {
				const outcome = await p.outcome(build);
				return isolate(outcome, "Failed") ? {} : skip();
			},
			run: () => "notified",
		});
	};
	const cleanupFor = (build: Job<string, null>) => {
		return job({
			name: "cleanup",
			plan: async (p) => ({ build: kind(await p.outcome(build)) }),
			run: (_t, { build }) => `cleaned after ${build}`,
		});
	};
	const passing = job({ name: "build", run: () => "dist" });
	const failing = job({
		name: "build",
		run: (): string => {
			throw new Error("compile error");
		},
	});

	// When: the build passes
	const green = unwrap(
		await run({ jobs: [notifyFor(passing), cleanupFor(passing)] }),
	);

	// Then: notify is skipped, cleanup runs
	assertEquals(outcomeOf({ report: green, name: "notify" }), Skipped());
	assertEquals(
		outcomeOf({ report: green, name: "cleanup" }),
		Succeeded("cleaned after Succeeded"),
	);

	// When: the build fails
	const red = unwrap(
		await run({ jobs: [notifyFor(failing), cleanupFor(failing)] }),
	);

	// Then: notify and cleanup both run
	assertEquals(
		outcomeOf({ report: red, name: "notify" }),
		Succeeded("notified"),
	);
	assertEquals(
		outcomeOf({ report: red, name: "cleanup" }),
		Succeeded("cleaned after Failed"),
	);
});

Deno.test("failFast aborts the rest through their signals", async () => {
	// Given: a failing job, a long sibling that honours its signal, a job
	// that would start after the sibling, and a dependent of the failure
	const events: string[] = [];
	const failing = job({
		name: "failing",
		run: () => Promise.reject(new Error("boom")),
	});
	const long = job({ name: "long", run: (t) => untilAborted(t.signal) });
	const later = job({
		name: "later",
		plan: (p) => ({ long: p.needs(long) }),
		run: () => {},
	});
	const dependent = job({
		name: "dependent",
		plan: (p) => ({ failing: p.needs(failing) }),
		run: () => {},
	});

	// When: running with failFast
	const report = unwrap(
		await run({
			jobs: [failing, long, later, dependent],
			failFast: true,
			events,
		}),
	);

	// Then: the running sibling and its dependent are Cancelled
	assertEquals(outcomeOf({ report, name: "long" }), Cancelled());
	assertEquals(outcomeOf({ report, name: "later" }), Cancelled());

	// Then: the failure's own dependent is still Blocked, not Cancelled
	assertEquals(outcomeOf({ report, name: "dependent" }), Blocked(["failing"]));
	assertEquals(report.passed, false);
	assert(events.includes("Started long"));
	assert(events.includes("Cancelled long"));
});

Deno.test("without failFast, siblings of a failure keep running", async () => {
	// Given: a failing job and a slow sibling
	const failing = job({
		name: "failing",
		run: () => Promise.reject(new Error("boom")),
	});
	const slow = job({
		name: "slow",
		run: async (t) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return t.signal.aborted;
		},
	});

	// When: running without failFast
	const report = unwrap(await run({ jobs: [failing, slow] }));

	// Then: the sibling finished, never seeing an abort
	assertEquals(outcomeOf({ report, name: "slow" }), Succeeded(false));
});

Deno.test("the run's signal cancels the whole run", async (t) => {
	await t.step(
		"aborted mid-run, running and waiting jobs are cancelled",
		async () => {
			// Given: a job that aborts the run once it starts, a long job, and its dependent
			const controller = new AbortController();
			const trigger = job({
				name: "trigger",
				run: () => controller.abort("stop"),
			});
			const long = job({ name: "long", run: (t) => untilAborted(t.signal) });
			const after = job({
				name: "after",
				plan: (p) => ({ long: p.needs(long) }),
				run: () => {},
			});

			// When: the run is cancelled from outside
			const report = unwrap(
				await run({ jobs: [trigger, after], signal: controller.signal }),
			);

			// Then: the trigger finished, the rest are Cancelled, and the run failed
			assertEquals(
				outcomeOf({ report, name: "trigger" }),
				Succeeded(undefined),
			);
			assertEquals(outcomeOf({ report, name: "long" }), Cancelled());
			assertEquals(outcomeOf({ report, name: "after" }), Cancelled());
			assertEquals(report.passed, false);
		},
	);

	await t.step("aborted before the run, nothing starts", async () => {
		// Given: an already-aborted signal
		let started = false;
		const any = job({
			name: "any",
			run: () => {
				started = true;
			},
		});

		// When: running
		const report = unwrap(
			await run({ jobs: [any], signal: AbortSignal.abort() }),
		);

		// Then: the job is Cancelled without starting
		assertEquals(outcomeOf({ report, name: "any" }), Cancelled());
		assertEquals(started, false);
	});
});

Deno.test("continueOnError affects only the run's verdict", async () => {
	// Given: an optional job that fails, and a job that needs it
	const optional = job({
		name: "optional",
		continueOnError: true,
		run: () => Promise.reject(new Error("flaky")),
	});
	const dependent = job({
		name: "dependent",
		plan: (p) => ({ optional: p.needs(optional) }),
		run: () => {},
	});

	// When: running both
	const report = unwrap(await run({ jobs: [optional, dependent] }));

	// Then: it still Failed and still blocks, but the run passes
	assert(isolate(outcomeOf({ report, name: "optional" }), "Failed"));
	assertEquals(outcomeOf({ report, name: "dependent" }), Blocked(["optional"]));
	assert(report.passed);
});

Deno.test("an invalid graph is an Err, never a throw or a hang", async (t) => {
	await t.step("two jobs with one name", async () => {
		// Given: two distinct jobs named alike
		const a = job({ name: "same", run: () => 1 });
		const b = job({ name: "same", run: () => 2 });

		// When: running both
		const result = await run({ jobs: [a, b] });

		// Then: DuplicateName
		assertEquals(unwrapErr(result), DuplicateName("same"));
	});

	await t.step("a cycle through needs", async () => {
		// Given: a needs b, b needs a (declared through a lazy reference)
		const ref: { a?: Job<void, null> } = {};
		const b = job({
			name: "b",
			plan: (p) => ({ a: ref.a === undefined ? undefined : p.needs(ref.a) }),
			run: () => {},
		});
		ref.a = job({ name: "a", plan: (p) => ({ b: p.needs(b) }), run: () => {} });

		// When: running
		const result = await run({ jobs: [ref.a] });

		// Then: a Cycle naming the path, starting and ending at the same job
		assertEquals(unwrapErr(result), Cycle(["b", "a", "b"]));
	});

	await t.step("a cycle through plan awaits", async () => {
		// Given: two plans that await each other's result
		const ref: { a?: Job<number, null> } = {};
		const b = job({
			name: "b",
			plan: async (p) => {
				return { n: ref.a === undefined ? 0 : await p.result(ref.a) };
			},
			run: () => 2,
		});
		ref.a = job({
			name: "a",
			plan: async (p) => ({ n: await p.result(b) }),
			run: () => 1,
		});

		// When: running
		const result = await run({ jobs: [ref.a] });

		// Then: the cycle is found while planning, and the run settles
		assertEquals(unwrapErr(result), Cycle(["b", "a", "b"]));
	});

	await t.step("a plan awaiting its own job", async () => {
		// Given: a self-await
		const ref: { self?: Job<number, null> } = {};
		ref.self = job({
			name: "self",
			plan: async (p) => {
				return { n: ref.self === undefined ? 0 : await p.result(ref.self) };
			},
			run: () => 1,
		});

		// When: running
		const result = await run({ jobs: [ref.self] });

		// Then: a one-job cycle
		assertEquals(unwrapErr(result), Cycle(["self", "self"]));
	});
});

Deno.test("events arrive in order: needs end before dependents start", async () => {
	// Given: build with two steps, test needing build, and a skipped job
	const events: string[] = [];
	const build = job({
		name: "build",
		run: async (t) => {
			await t.step("compile", () => {});
			await t.step("bundle", () => "out.js");
			return "dist";
		},
	});
	const test = job({
		name: "test",
		plan: (p) => ({ build: p.needs(build) }),
		run: () => {},
	});
	const deploy = job({ name: "deploy", plan: () => skip(), run: () => {} });

	// When: they run
	unwrap(await run({ jobs: [test, deploy], events }));

	// Then: the whole sequence, with no Started for the skipped job
	assertEquals(events, [
		"Skipped deploy",
		"Started build",
		"StepStarted build/compile",
		"StepFinished build/compile Ok",
		"StepStarted build/bundle",
		"StepFinished build/bundle Ok",
		"Finished build Succeeded",
		"Started test",
		"Finished test Succeeded",
	]);
});

Deno.test("a failing step is reported, then fails its job", async () => {
	// Given: a step that throws
	const events: string[] = [];
	const build = job({
		name: "build",
		run: async (t) => {
			await t.step("compile", () => {
				throw new Error("syntax error");
			});
		},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [build], events }));

	// Then: the step finished Err, and the job Failed with the step's error
	assertEquals(events, [
		"Started build",
		"StepStarted build/compile",
		"StepFinished build/compile Err",
		"Finished build Failed",
	]);
	assert(isolate(outcomeOf({ report, name: "build" }), "Failed"));
});

Deno.test("p used after its plan settled panics", async () => {
	// Given: a plan that leaks p into its value, and a run that uses it
	const other = job({ name: "other", run: () => 1 });
	const leaky = job({
		name: "leaky",
		plan: (p) => ({ p: () => p.needs(other) }),
		run: (_t, { p }) => void p(),
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [leaky] }));

	// Then: the misuse panicked, which the body boundary records as Failed
	const outcome = outcomeOf({ report, name: "leaky" });
	assert(isolate(outcome, "Failed"));
	assertInstanceOf(union(outcome), Panic);
});
