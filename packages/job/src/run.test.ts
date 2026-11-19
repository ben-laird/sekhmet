import { isolate, match, union } from "@sekhmet/enum/core/mini";
import {
	Err,
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
	type Planner,
	type PlanRecord,
	type RunOptions,
	type RunReport,
	runJobs,
	Skipped,
	Succeeded,
	skip,
} from "@sekhmet/job";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";

const { job, observer } = defineJobs<null>();

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

/** The position of `event` in `events`, failing if it's missing. */
function indexOf({
	events,
	event,
}: {
	events: string[];
	event: string;
}): number {
	const index = events.indexOf(event);
	assert(index >= 0, `missing event: ${event}`);
	return index;
}

/** One line per event, so a test can compare the whole sequence. */
function describe(event: JobEvent): string {
	return match(event)({
		Started: ({ job }) => `Started ${job}`,
		StepStarted: ({ job, step }) => `StepStarted ${job}/${step}`,
		StepSucceeded: ({ job, step }) => `StepSucceeded ${job}/${step}`,
		StepFailed: ({ job, step }) => `StepFailed ${job}/${step}`,
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
		if (signal.aborted) reject(signal.reason);
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
	const lintError = lintOutcome.error().unwrap();
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
	const error = outcome.error().unwrap();
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
				const versioned = await p.result(version);
				if (isErr(versioned)) return versioned;
				const v = unwrap(versioned);
				return {
					version: v,
					sign: v.startsWith("0.") ? undefined : p.needs(sign),
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
		const events: string[] = [];
		const report = unwrap(await run({ jobs: [publishFor("1.0.0")], events }));

		// Then: version, then sign, ran before publish started, and sign's result arrived
		assertEquals(
			outcomeOf({ report, name: "publish" }),
			Succeeded("1.0.0 sig"),
		);
		assertEquals(signed, true);
		const started = indexOf({ events, event: "Started publish" });
		assert(indexOf({ events, event: "Finished version Succeeded" }) < started);
		assert(indexOf({ events, event: "Finished sign Succeeded" }) < started);
		assert(
			indexOf({ events, event: "Finished version Succeeded" }) <
				indexOf({ events, event: "Started sign" }),
		);
	});
});

Deno.test("p.result of a job that fails is an Err, and blocks", async (t) => {
	// Given: a version job that fails
	const version = job({
		name: "version",
		run: () => {
			throw new Error("no tags");
		},
	});

	await t.step("a plan that returns the Err gives up as Blocked", async () => {
		// Given: a plan that gives up on the Err, with a finally
		const seen: string[] = [];
		const publish = job({
			name: "publish",
			plan: async (p) => {
				try {
					const versioned = await p.result(version);
					if (isErr(versioned)) {
						seen.push(unwrapErr(versioned).job);
						return versioned;
					}
					return { version: unwrap(versioned) };
				} finally {
					seen.push("finally");
				}
			},
			run: () => {},
		});

		// When: it runs
		const report = unwrap(await run({ jobs: [publish] }));

		// Then: the plan resumed (finally ran), and the job is Blocked by version
		assertEquals(seen, ["version", "finally"]);
		assertEquals(outcomeOf({ report, name: "publish" }), Blocked(["version"]));
	});

	await t.step(
		"a plan that carries on is still Blocked before its run",
		async () => {
			// Given: a plan that keeps the Err as data and returns a plan
			let ran = false;
			const publish = job({
				name: "publish",
				plan: async (p) => ({ version: await p.result(version) }),
				run: () => {
					ran = true;
				},
			});

			// When: it runs
			const report = unwrap(await run({ jobs: [publish] }));

			// Then: the awaited job counts as a need, so the run never starts
			assertEquals(
				outcomeOf({ report, name: "publish" }),
				Blocked(["version"]),
			);
			assertEquals(ran, false);
		},
	);

	await t.step("a plan may turn the Err into a skip", async () => {
		// Given: a plan that skips when version has no value
		const publish = job({
			name: "publish",
			plan: async (p) => {
				const versioned = await p.result(version);
				return isErr(versioned) ? skip() : { version: unwrap(versioned) };
			},
			run: () => {},
		});

		// When: it runs
		const report = unwrap(await run({ jobs: [publish] }));

		// Then: skip() is the plan's own decision
		assertEquals(outcomeOf({ report, name: "publish" }), Skipped());
	});
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
			await t.step({ name: "compile", run: () => {} });
			await t.step({ name: "bundle", run: () => "out.js" });
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

	// Then: each job's own sequence, needs first, and no Started for a skip
	assertEquals(
		events.filter((event) => event.includes("deploy")),
		["Skipped deploy"],
	);
	assertEquals(
		events.filter((event) => !event.includes("deploy")),
		[
			"Started build",
			"StepStarted build/compile",
			"StepSucceeded build/compile",
			"StepStarted build/bundle",
			"StepSucceeded build/bundle",
			"Finished build Succeeded",
			"Started test",
			"Finished test Succeeded",
		],
	);
});

Deno.test("a failing step is reported, then fails its job", async () => {
	// Given: a step that throws
	const events: string[] = [];
	const build = job({
		name: "build",
		run: async (t) => {
			await t.step({
				name: "compile",
				run: () => {
					throw new Error("syntax error");
				},
			});
		},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [build], events }));

	// Then: the step finished Err, and the job Failed with the step's error
	assertEquals(events, [
		"Started build",
		"StepStarted build/compile",
		"StepFailed build/compile",
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

Deno.test("an untyped caller's non-plain plan panics, failing its job", async () => {
	// Given: values typed as plan records that aren't plain at run time, as an
	// untyped (JavaScript) caller can return
	const arrayPlan: PlanRecord = JSON.parse("[1]");
	const symbolPlan: PlanRecord = JSON.parse("{}");
	Object.defineProperty(symbolPlan, Symbol("key"), { enumerable: true });
	const array = job({ name: "array", plan: () => arrayPlan, run: () => {} });
	const symbol = job({ name: "symbol", plan: () => symbolPlan, run: () => {} });

	// When: they run
	const report = unwrap(await run({ jobs: [array, symbol] }));

	// Then: each job Failed with a NonPlainPlan panic instead of misresolving
	for (const name of ["array", "symbol"]) {
		const outcome = outcomeOf({ report, name });
		const panic = outcome.error().unwrap();
		assertInstanceOf(panic, Panic);
		assertEquals(panic.name, "Panic (NonPlainPlan)");
	}
});

Deno.test("a job ends after every job its plan touched", async (t) => {
	await t.step("giving up on a failed result", async () => {
		// Given: a plan that declares a slow need, then awaits a failing result
		const events: string[] = [];
		const slow = job({
			name: "slow",
			run: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return 1;
			},
		});
		const bad = job({ name: "bad", run: () => Promise.reject(new Error("x")) });
		const a = job({
			name: "a",
			plan: async (p) => {
				const s = p.needs(slow);
				const badResult = await p.result(bad);
				if (isErr(badResult)) return badResult;
				return { s, bad: unwrap(badResult) };
			},
			run: () => {},
		});

		// When: it runs
		const report = unwrap(await run({ jobs: [a], events }));

		// Then: a is Blocked by bad, and only after slow finished
		assertEquals(outcomeOf({ report, name: "a" }), Blocked(["bad"]));
		assert(
			indexOf({ events, event: "Finished slow Succeeded" }) <
				indexOf({ events, event: "Blocked a by bad" }),
		);
	});

	await t.step("blockedBy names every unhealthy declared need", async () => {
		// Given: a plan that declares one failing need, then awaits another
		const first = job({
			name: "first",
			run: () => Promise.reject(new Error("1")),
		});
		const second = job({
			name: "second",
			run: () => Promise.reject(new Error("2")),
		});
		const a = job({
			name: "a",
			plan: async (p) => {
				const f = p.needs(first);
				return { f, s: await p.result(second) };
			},
			run: () => {},
		});

		// When: it runs
		const report = unwrap(await run({ jobs: [a] }));

		// Then: both are named, in the order the plan reached them
		assertEquals(
			outcomeOf({ report, name: "a" }),
			Blocked(["first", "second"]),
		);
	});

	await t.step("cancelled by the run's signal", async () => {
		// Given: a plan that declares a long need and awaits another's result
		const events: string[] = [];
		const controller = new AbortController();
		const long = job({ name: "long", run: (t) => untilAborted(t.signal) });
		const slowResult = job({
			name: "slowResult",
			run: async (t) => {
				controller.abort("stop");
				return await untilAborted(t.signal);
			},
		});
		const a = job({
			name: "a",
			plan: async (p) => {
				const l = p.needs(long);
				return { l, r: await p.result(slowResult) };
			},
			run: () => {},
		});

		// When: the run is cancelled while a's plan waits
		unwrap(await run({ jobs: [a], events, signal: controller.signal }));

		// Then: a's Cancelled comes after both of its jobs' terminal events
		const end = indexOf({ events, event: "Cancelled a" });
		assert(indexOf({ events, event: "Cancelled long" }) < end);
		assert(indexOf({ events, event: "Cancelled slowResult" }) < end);
	});
});

Deno.test("failFast still blocks a staged plan whose declared need failed", async () => {
	// Given: a plan that declares a failing need, then awaits a slow result
	const failing = job({
		name: "failing",
		run: () => Promise.reject(new Error("x")),
	});
	const slow = job({ name: "slow", run: (t) => untilAborted(t.signal) });
	const staged = job({
		name: "staged",
		plan: async (p) => {
			const f = p.needs(failing);
			return { f, s: await p.result(slow) };
		},
		run: () => {},
	});

	// When: running with failFast, which cancels slow while staged waits
	const report = unwrap(await run({ jobs: [staged], failFast: true }));

	// Then: staged is Blocked by the failure, not Cancelled
	assertEquals(outcomeOf({ report, name: "slow" }), Cancelled());
	assertEquals(outcomeOf({ report, name: "staged" }), Blocked(["failing"]));
});

Deno.test("a handle smuggled from another plan panics when resolved", async () => {
	// Given: a's plan declares x; b's plan returns a's handle without declaring x
	const x = job({ name: "x", run: () => 1 });
	const smuggled: { handle?: ReturnType<Planner<null>["needs"]> } = {};
	const a = job({
		name: "a",
		plan: (p) => {
			smuggled.handle = p.needs(x);
			return { x: smuggled.handle };
		},
		run: () => {},
	});
	const b = job({
		name: "b",
		plan: async (p) => {
			await p.outcome(a);
			return { x: smuggled.handle };
		},
		run: () => {},
	});

	// When: b runs
	const report = unwrap(await run({ jobs: [b] }));

	// Then: resolving the undeclared handle panicked, failing b
	const outcome = outcomeOf({ report, name: "b" });
	const panic = outcome.error().unwrap();
	assertInstanceOf(panic, Panic);
	assertEquals(panic.name, "Panic (UndeclaredHandle)");
});

Deno.test("a throwing onEvent still leaves the caller's signal clean", async () => {
	// Given: a signal that counts its listeners, and a hook that throws
	const controller = new AbortController();
	let listeners = 0;
	const add = controller.signal.addEventListener.bind(controller.signal);
	const remove = controller.signal.removeEventListener.bind(controller.signal);
	controller.signal.addEventListener = (...args: Parameters<typeof add>) => {
		listeners += 1;
		add(...args);
	};
	controller.signal.removeEventListener = (
		...args: Parameters<typeof remove>
	) => {
		listeners -= 1;
		remove(...args);
	};
	const only = job({ name: "only", run: () => 1 });

	// When: the run's hook throws on the first event
	const thrown = await runJobs({
		jobs: [only],
		context: null,
		signal: controller.signal,
		onEvent: () => {
			throw new Error("hook bug");
		},
	}).then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: the throw escaped (it's a bug in the hook), and no listener leaked
	assertInstanceOf(thrown, Error);
	assertEquals(listeners, 0);
});

Deno.test("a body cancelled mid-step reports the step, then Cancelled", async () => {
	// Given: a body whose step waits on the signal, and a run signal to abort
	const events: string[] = [];
	const controller = new AbortController();
	const deploy = job({
		name: "deploy",
		run: async (t) => {
			await t.step({
				name: "upload",
				run: () => {
					controller.abort("stop");
					return untilAborted(t.signal);
				},
			});
		},
	});

	// When: the run is cancelled during the step
	const report = unwrap(
		await run({ jobs: [deploy], events, signal: controller.signal }),
	);

	// Then: the step ends Err, and the job Cancelled, not Failed
	assertEquals(events, [
		"Started deploy",
		"StepStarted deploy/upload",
		"StepFailed deploy/upload",
		"Cancelled deploy",
	]);
	assertEquals(outcomeOf({ report, name: "deploy" }), Cancelled());
});

Deno.test("a cycle closed after a staged await is an Err", async () => {
	// Given: a's plan awaits x's result, then needs b; b needs a
	const ref: { a?: Job<void, null> } = {};
	const x = job({ name: "x", run: () => 1 });
	const b = job({
		name: "b",
		plan: (p) => ({ a: ref.a === undefined ? undefined : p.needs(ref.a) }),
		run: () => {},
	});
	ref.a = job({
		name: "a",
		plan: async (p) => {
			const n = await p.result(x);
			return { n, b: p.needs(b) };
		},
		run: () => {},
	});

	// When: running (the cycle exists only once x has a result)
	const result = await run({ jobs: [ref.a] });

	// Then: it is found, and the run settles
	assertEquals(unwrapErr(result), Cycle(["b", "a", "b"]));
});

Deno.test("observers survive cancellation, as always() does", async (t) => {
	await t.step("failFast still runs a failure() notifier", async () => {
		// Given: a failing build, an ordinary sibling, and a notifier observer
		let sawAbort = false;
		const build = job({
			name: "build",
			run: () => Promise.reject(new Error("x")),
		});
		const lint = job({ name: "lint", run: (t) => untilAborted(t.signal) });
		const notify = observer({
			name: "notify",
			plan: async (p) => {
				return (await p.outcome(build)).isUnhealthy() ? {} : skip();
			},
			run: (t) => {
				sawAbort = t.signal.aborted;
				return "paged";
			},
		});

		// When: running with failFast
		const report = unwrap(
			await run({ jobs: [build, lint, notify], failFast: true }),
		);

		// Then: the ordinary sibling is cancelled; the notifier runs, and knows
		assertEquals(outcomeOf({ report, name: "lint" }), Cancelled());
		assertEquals(outcomeOf({ report, name: "notify" }), Succeeded("paged"));
		assertEquals(sawAbort, true);
	});

	await t.step("the run's signal still runs an always() cleanup", async () => {
		// Given: a long job, a cleanup observer, an ordinary dependent, a signal
		const controller = new AbortController();
		const long = job({
			name: "long",
			run: (t) => {
				controller.abort("stop");
				return untilAborted(t.signal);
			},
		});
		const cleanup = observer({
			name: "cleanup",
			plan: async (p) => {
				await p.outcome(long);
				return {};
			},
			run: (t) => (t.signal.aborted ? "cleaned after abort" : "cleaned"),
		});
		const after = job({
			name: "after",
			plan: (p) => ({ long: p.needs(long) }),
			run: () => {},
		});

		// When: the run is cancelled
		const report = unwrap(
			await run({ jobs: [cleanup, after], signal: controller.signal }),
		);

		// Then: long and its ordinary dependent are cancelled; cleanup ran
		assertEquals(outcomeOf({ report, name: "long" }), Cancelled());
		assertEquals(outcomeOf({ report, name: "after" }), Cancelled());
		assertEquals(
			outcomeOf({ report, name: "cleanup" }),
			Succeeded("cleaned after abort"),
		);
	});

	await t.step("whatever an observer awaits before p.outcome", async () => {
		// Given: an observer whose plan awaits something else first, so the run
		// is cancelled before it ever calls p.outcome (the timing rule's gap)
		const controller = new AbortController();
		const long = job({
			name: "long",
			run: (t) => {
				controller.abort("stop");
				return untilAborted(t.signal);
			},
		});
		const summary = observer({
			name: "report",
			plan: async (p) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { long: kind(await p.outcome(long)) };
			},
			run: (t, { long }) => `${long}, aborted: ${t.signal.aborted}`,
		});

		// When: the run is cancelled while the observer's plan waits
		const report = unwrap(
			await run({ jobs: [long, summary], signal: controller.signal }),
		);

		// Then: the observer still planned and ran
		assertEquals(
			outcomeOf({ report, name: "report" }),
			Succeeded("Cancelled, aborted: true"),
		);
	});

	await t.step(
		"a job that only awaits p.outcome is still cancelled",
		async () => {
			// Given: an ordinary job (not an observer) whose plan only observes
			const controller = new AbortController();
			const long = job({
				name: "long",
				run: (t) => {
					controller.abort("stop");
					return untilAborted(t.signal);
				},
			});
			let ran = false;
			const watcher = job({
				name: "watcher",
				plan: async (p) => ({ long: kind(await p.outcome(long)) }),
				run: () => {
					ran = true;
				},
			});

			// When: the run is cancelled
			const report = unwrap(
				await run({ jobs: [long, watcher], signal: controller.signal }),
			);

			// Then: only declared observers survive; this job is Cancelled
			assertEquals(outcomeOf({ report, name: "watcher" }), Cancelled());
			assertEquals(ran, false);
		},
	);
});

Deno.test("an observer's p refuses needs and result at run time", async (t) => {
	// Given: a job, and an observer whose plan reaches past its types
	const other = job({ name: "other", run: () => 1 });
	const misuse = async (method: "needs" | "result") => {
		const sneaky = observer({
			name: `sneaky-${method}`,
			plan: (p) => {
				const call = Reflect.get(p, method);
				call(other);
				return {};
			},
			run: () => {},
		});
		return outcomeOf({
			report: unwrap(await run({ jobs: [sneaky] })),
			name: `sneaky-${method}`,
		});
	};

	for (const method of ["needs", "result"] as const) {
		await t.step(`p.${method}() panics, failing the observer`, async () => {
			// When: the observer's plan calls it
			const outcome = await misuse(method);

			// Then: an ObserverDependency panic failed the observer
			const panic = outcome.error().unwrap();
			assertInstanceOf(panic, Panic);
			assertEquals(panic.name, "Panic (ObserverDependency)");
		});
	}
});

Deno.test("only the abort itself makes a body Cancelled", async (t) => {
	await t.step("a real bug thrown after the abort is Failed", async () => {
		// Given: a body that, once aborted, throws an unrelated error
		const controller = new AbortController();
		const buggy = job({
			name: "buggy",
			run: async (t) => {
				controller.abort("stop");
				await Promise.resolve();
				if (t.signal.aborted) throw new TypeError("cleanup bug");
			},
		});

		// When: the run is cancelled
		const report = unwrap(
			await run({ jobs: [buggy], signal: controller.signal }),
		);

		// Then: the bug is reported, not hidden as a cancellation
		const outcome = outcomeOf({ report, name: "buggy" });
		assert(isolate(outcome, "Failed"));
		assertInstanceOf(union(outcome), TypeError);
	});

	await t.step(
		"the signal's reason or an AbortError is Cancelled",
		async () => {
			// Given: bodies that rethrow the reason, and an AbortError
			const controller = new AbortController();
			const reason = job({
				name: "reason",
				run: (t) => {
					controller.abort(new Error("stop"));
					throw t.signal.reason;
				},
			});
			const abortError = observer({
				name: "abortError",
				plan: async (p) => {
					await p.outcome(reason);
					return {};
				},
				run: () => {
					throw new DOMException("aborted", "AbortError");
				},
			});

			// When: the run is cancelled
			const report = unwrap(
				await run({ jobs: [reason, abortError], signal: controller.signal }),
			);

			// Then: both are Cancelled
			assertEquals(outcomeOf({ report, name: "reason" }), Cancelled());
			assertEquals(outcomeOf({ report, name: "abortError" }), Cancelled());
		},
	);
});

Deno.test("an Err no unmet p.result produced fails the plan's job", async () => {
	// Given: a plan that returns an Err of its own making, with no failed need
	const forged = job({
		name: "forged",
		plan: () => Err({ job: "nobody", outcome: Skipped() }),
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: [forged] }));

	// Then: nothing explains the Err, so the job Failed with a panic
	const outcome = outcomeOf({ report, name: "forged" });
	const panic = outcome.error().unwrap();
	assertInstanceOf(panic, Panic);
	assertEquals(panic.name, "Panic (UnexplainedErr)");
});

Deno.test("a need's outcome propagates: Blocked > Cancelled > Skipped", async (t) => {
	await t.step("a skipped need skips its dependent", async () => {
		// Given: a job its plan skips, and a dependent
		const deploy = job({ name: "deploy", plan: () => skip(), run: () => 1 });
		const announce = job({
			name: "announce",
			plan: (p) => ({ deploy: p.needs(deploy) }),
			run: () => {},
		});

		// When: they run
		const report = unwrap(await run({ jobs: [announce] }));

		// Then: the dependent is Skipped too (it has no value to receive)
		assertEquals(outcomeOf({ report, name: "announce" }), Skipped());
	});

	await t.step("a cancelled need cancels its dependent", async () => {
		// Given: a long job cancelled by the run's signal, and a dependent
		const controller = new AbortController();
		const long = job({
			name: "long",
			run: (t) => {
				controller.abort("stop");
				return untilAborted(t.signal);
			},
		});
		const after = job({
			name: "after",
			plan: (p) => ({ long: p.needs(long) }),
			run: () => {},
		});

		// When: the run is cancelled
		const report = unwrap(
			await run({ jobs: [after], signal: controller.signal }),
		);

		// Then: the dependent is Cancelled, like its need
		assertEquals(outcomeOf({ report, name: "long" }), Cancelled());
		assertEquals(outcomeOf({ report, name: "after" }), Cancelled());
	});

	await t.step("with mixed needs, the strongest wins", async () => {
		// Given: under failFast, a failing job, a long job it cancels, a skip
		const failing = job({
			name: "failing",
			run: () => Promise.reject(new Error("x")),
		});
		const long = job({ name: "long", run: (t) => untilAborted(t.signal) });
		const skipped = job({ name: "skipped", plan: () => skip(), run: () => 1 });
		const all = job({
			name: "all",
			plan: (p) => {
				return {
					s: p.needs(skipped),
					l: p.needs(long),
					f: p.needs(failing),
				};
			},
			run: () => {},
		});
		const noFailure = job({
			name: "noFailure",
			plan: (p) => ({ s: p.needs(skipped), l: p.needs(long) }),
			run: () => {},
		});

		// When: they run
		const report = unwrap(
			await run({ jobs: [all, noFailure], failFast: true }),
		);

		// Then: Blocked outranks Cancelled and Skipped; Cancelled outranks Skipped
		assertEquals(outcomeOf({ report, name: "all" }), Blocked(["failing"]));
		assertEquals(outcomeOf({ report, name: "noFailure" }), Cancelled());
	});
});

Deno.test("continueOnError exempts a failure from failFast", async () => {
	// Given: under failFast, an optional job that fails and a slow sibling
	const optional = job({
		name: "optional",
		continueOnError: true,
		run: () => Promise.reject(new Error("flaky")),
	});
	const slow = job({
		name: "slow",
		run: async (t) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return t.signal.aborted;
		},
	});

	// When: they run
	const report = unwrap(await run({ jobs: [optional, slow], failFast: true }));

	// Then: the tolerated failure aborted nothing, and the run passes
	assert(isolate(outcomeOf({ report, name: "optional" }), "Failed"));
	assertEquals(outcomeOf({ report, name: "slow" }), Succeeded(false));
	assert(report.passed);
});

Deno.test("a plan the run abandoned finishes with an inert p", async () => {
	// Given: a staged plan that, after the run is cancelled under it, still
	// needs and observes another job
	const controller = new AbortController();
	const finished = Promise.withResolvers<string>();
	let otherPlanned = 0;
	const other = job({
		name: "other",
		plan: () => {
			otherPlanned += 1;
			return {};
		},
		run: () => {},
	});
	const long = job({
		name: "long",
		run: (t) => {
			controller.abort("stop");
			return untilAborted(t.signal);
		},
	});
	const staged = job({
		name: "staged",
		plan: async (p) => {
			try {
				await p.result(long);
				p.needs(other);
				finished.resolve(kind(await p.outcome(other)));
			} catch (error) {
				finished.resolve(`threw ${String(error)}`);
			}
			return {};
		},
		run: () => {},
	});

	// When: the run is cancelled while staged waits, and its plan resumes
	const report = unwrap(
		await run({ jobs: [staged], signal: controller.signal }),
	);
	const seen = await finished.promise;

	// Then: no ClosedPlanner panic, nothing scheduled, and staged Cancelled
	assertEquals(seen, "Cancelled");
	assertEquals(otherPlanned, 0);
	assertEquals(outcomeOf({ report, name: "staged" }), Cancelled());
});

Deno.test("a throwing onEvent cancels the run instead of orphaning jobs", async () => {
	// Given: a quick job whose Finished event makes the hook throw, and a
	// sibling that waits for its signal
	let sawAbort = false;
	const quick = job({ name: "quick", run: () => 1 });
	const sibling = job({
		name: "sibling",
		run: async (t) => {
			try {
				await untilAborted(t.signal);
			} finally {
				sawAbort = t.signal.aborted;
			}
		},
	});
	const hookError = new Error("hook bug");

	// When: the run's hook throws
	const thrown = await runJobs({
		jobs: [quick, sibling],
		context: null,
		onEvent: (event) => {
			if (isolate(event, "Finished")) throw hookError;
		},
	}).then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: the sibling saw its signal abort, and runJobs rejected with the bug
	assertEquals(sawAbort, true);
	assert(thrown === hookError);
});
