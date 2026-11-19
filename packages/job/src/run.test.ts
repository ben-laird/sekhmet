import { isolate, match } from "@sekhmet/enum/core/mini";
import {
	isErr,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import {
	always,
	Blocked,
	Cancelled,
	Cycle,
	cancelled,
	DuplicateName,
	defineJobs,
	failed,
	failure,
	type GraphError,
	type Job,
	type JobEvent,
	type JobOutcome,
	type OutcomeView,
	type PlanRecord,
	type Roots,
	type RunReport,
	runJobs,
	Skipped,
	Succeeded,
	succeeded,
	succeededWith,
	UndeclaredGuardRead,
} from "@sekhmet/job";
import { Panic } from "@sekhmet/panic/mini/core";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";

const { job } = defineJobs<null>();

/** Runs `jobs` with a null context, failing the test if it takes over 2s. */
async function run<J extends Roots<null>>({
	jobs,
	events,
	signal,
	failFast,
}: {
	readonly jobs: J;
	readonly events?: string[];
	readonly signal?: AbortSignal;
	readonly failFast?: boolean;
}): Promise<Result<RunReport<J>, GraphError>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("run did not settle")), 2000);
	});
	try {
		return await Promise.race([
			runJobs({
				jobs,
				context: null,
				signal,
				failFast,
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

/** A job reached by the run, by name, failing if it wasn't reached. */
function reached({
	report,
	name,
}: {
	readonly report: RunReport<unknown>;
	readonly name: string;
}): JobOutcome<unknown> {
	const outcome = report.all.get(name);
	assert(outcome !== undefined, `no outcome for ${name}`);
	return outcome;
}

/** Rejects when `signal` aborts; a body that honours cancellation. */
function untilAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) reject(signal.reason);
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}

/** A job whose body throws `message`. */
function failing(name: string): Job<string, null> {
	return job({
		name,
		run: (): string => {
			throw new Error(`${name} broke`);
		},
	});
}

Deno.test("the report mirrors the roots, typed per key", async () => {
	// Given: two roots returning different types
	const version = job({ name: "version", run: () => "1.2.0" });
	const count = job({ name: "count", run: () => 3 });

	// When: they run as a record
	const report = unwrap(await run({ jobs: { version, count } }));

	// Then: each root's outcome sits under its key, with its own type
	const text: JobOutcome<string> = report.outcomes.version;
	const number: JobOutcome<number> = report.outcomes.count;
	assertEquals(text, Succeeded("1.2.0"));
	assertEquals(number, Succeeded(3));
	assertEquals([...report.all.keys()].sort(), ["count", "version"]);
	assert(report.passed);
});

Deno.test("each job runs once per run, and dependents share its result", async () => {
	// Given: a diamond: two jobs need build, and the root needs both
	let builds = 0;
	const build = job({
		name: "build",
		run: () => {
			builds += 1;
			return { outDir: "dist" };
		},
	});
	const test = job({
		name: "test",
		plan: (p) => ({ build: p.needs(build) }),
		run: (_t, { build }) => build,
	});
	const lint = job({
		name: "lint",
		plan: (p) => ({ build: p.needs(build) }),
		run: (_t, { build }) => build,
	});
	const gate = job({
		name: "gate",
		plan: (p) => ({ test: p.needs(test), lint: p.needs(lint) }),
		run: (_t, { test, lint }) => test === lint,
	});

	// When: the root and build itself run
	const report = unwrap(await run({ jobs: { gate, build } }));

	// Then: build ran once, and both dependents got the same object
	assertEquals(builds, 1);
	assertEquals(report.outcomes.gate, Succeeded(true));
});

Deno.test("a failed need blocks its dependents, transitively", async () => {
	// Given: lint fails; test needs lint and build; gate needs test
	const lint = failing("lint");
	const build = job({ name: "build", run: () => "dist" });
	const test = job({
		name: "test",
		plan: (p) => ({ lint: p.needs(lint), build: p.needs(build) }),
		run: () => {},
	});
	const gate = job({
		name: "gate",
		plan: (p) => ({ test: p.needs(test), lint: p.needs(lint) }),
		run: () => {},
	});

	// When: gate runs
	const report = unwrap(await run({ jobs: { gate } }));

	// Then: Blocked names every unhealthy need, in declaration order
	assertEquals(reached({ report, name: "test" }), Blocked(["lint"]));
	assertEquals(report.outcomes.gate, Blocked(["test", "lint"]));
	assertEquals(reached({ report, name: "build" }), Succeeded("dist"));
	assertEquals(report.passed, false);
});

Deno.test("Blocked keeps plan order for integer-like job names", async () => {
	// Given: three failing needs named z, 2 and 1, declared in that order
	const gate = job({
		name: "gate",
		plan: (p) => {
			return {
				needs: [
					p.needs(failing("z")),
					p.needs(failing("2")),
					p.needs(failing("1")),
				],
			};
		},
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { gate } }));

	// Then: Blocked names them as declared, not in a record's key order
	assertEquals(report.outcomes.gate, Blocked(["z", "2", "1"]));
});

Deno.test("needs nested in arrays and records resolve in place", async () => {
	// Given: needs inside arrays of records, beside data and a Map
	const a = job({ name: "a", run: () => 1 });
	const b = job({ name: "b", run: () => 2 });
	const lookup = new Map([["k", "v"]]);
	const sum = job({
		name: "sum",
		plan: (p) => {
			return {
				items: [
					{ label: "a", value: p.needs(a) },
					{ label: "b", value: p.needs(b) },
				],
				lookup,
			};
		},
		run: (_t, { items, lookup: found }) => {
			const total: number = items.reduce((n, { value }) => n + value, 0);
			return { total, labels: items.map(({ label }) => label), found };
		},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { sum } }));

	// Then: each need became its value; the Map passed through untouched
	const value = report.outcomes.sum.value().unwrap();
	assertEquals(value.total, 3);
	assertEquals(value.labels, ["a", "b"]);
	assert(value.found === lookup);
});

Deno.test("needsIf pulls a job in only when its guard holds", async (t) => {
	const version = job({ name: "version", run: () => "1.4.0" });
	let signed = 0;
	const sign = job({
		name: "sign",
		run: () => {
			signed += 1;
			return "sig";
		},
	});
	const publish = job({
		name: "publish",
		plan: (p) => {
			const v = p.needs(version);
			const stable = succeededWith({
				need: v,
				where: (value) => !value.startsWith("0."),
				describe: "a stable version",
			});
			return { version: v, signature: p.needsIf({ job: sign, when: stable }) };
		},
		run: (_t, { version, signature }) => `${version} ${signature ?? "none"}`,
	});

	await t.step("a true guard pulls the job in", async () => {
		// Given: a stable version
		signed = 0;

		// When: publish runs
		const report = unwrap(await run({ jobs: { publish } }));

		// Then: sign ran, and publish got its value
		assertEquals(report.outcomes.publish, Succeeded("1.4.0 sig"));
		assertEquals(signed, 1);
	});

	await t.step(
		"a false guard leaves the need undefined, and never runs it",
		async () => {
			// Given: a 0.x version
			signed = 0;
			const early = job({ name: "version", run: () => "0.3.0" });
			const draft = job({
				name: "draft",
				plan: (p) => {
					const v = p.needs(early);
					const stable = succeededWith({
						need: v,
						where: (value) => !value.startsWith("0."),
						describe: "a stable version",
					});
					return {
						version: v,
						signature: p.needsIf({ job: sign, when: stable }),
					};
				},
				run: (_t, { signature }) => signature ?? "none",
			});

			// When: it runs
			const report = unwrap(await run({ jobs: { draft } }));

			// Then: sign was never reached
			assertEquals(report.outcomes.draft, Succeeded("none"));
			assertEquals(signed, 0);
			assertEquals(report.all.has("sign"), false);
		},
	);
});

Deno.test("a pulled-in need that fails blocks its dependent", async () => {
	// Given: a guard that holds, pulling in a job that fails
	const build = job({ name: "build", run: () => "dist" });
	const deploy = failing("deploy");
	const release = job({
		name: "release",
		plan: (p) => {
			const built = p.needs(build);
			return {
				built,
				deployed: p.needsIf({ job: deploy, when: succeeded(built) }),
			};
		},
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { release } }));

	// Then: release is blocked by the guarded need, as by any other
	assertEquals(report.outcomes.release, Blocked(["deploy"]));
});

Deno.test("a guard may read only its own plan's unconditional needs", async (t) => {
	let ran = 0;
	const versionJob = job({
		name: "version",
		run: () => {
			ran += 1;
			return "1.2.0";
		},
	});
	const signJob = job({
		name: "sign",
		run: () => {
			ran += 1;
			return "sig";
		},
	});

	await t.step("a read left out of the plan is a graph error", async () => {
		// Given: a guard reading version, which the plan leaves out
		ran = 0;
		const publish = job({
			name: "publish",
			plan: (p) => {
				const version = p.needs(versionJob);
				return { sign: p.needsIf({ job: signJob, when: succeeded(version) }) };
			},
			run: () => {},
		});

		// When: it runs
		const result = await run({ jobs: { publish } });

		// Then: UndeclaredGuardRead names the job, the guard and the read,
		// and nothing ran
		assertEquals(
			unwrapErr(result),
			UndeclaredGuardRead({
				job: "publish",
				guard: "version succeeded",
				read: "version",
			}),
		);
		assertEquals(ran, 0);
	});

	await t.step("the same read in the plan works", async () => {
		// Given: the same plan with version in it
		ran = 0;
		const publish = job({
			name: "publish",
			plan: (p) => {
				const version = p.needs(versionJob);
				return {
					version,
					sign: p.needsIf({ job: signJob, when: succeeded(version) }),
				};
			},
			run: (_t, { version, sign }) => `${version} ${sign ?? "unsigned"}`,
		});

		// When: it runs
		const report = unwrap(await run({ jobs: { publish } }));

		// Then: the guard read version, and sign was pulled in
		assertEquals(report.outcomes.publish, Succeeded("1.2.0 sig"));
		assertEquals(ran, 2);
	});

	await t.step("a read of another guarded need is a graph error", async () => {
		// Given: a second guard reading the first guard's need
		const docs = job({ name: "docs", run: () => "site" });
		const site = job({
			name: "site",
			plan: (p) => {
				const version = p.needs(versionJob);
				const documented = p.needsIf({ job: docs, when: succeeded(version) });
				return {
					version,
					documented,
					sign: p.needsIf({ job: signJob, when: succeeded(documented) }),
				};
			},
			run: () => {},
		});

		// When: it runs
		const result = await run({ jobs: { site } });

		// Then: guards run after the unconditional needs, so it's an error
		assertEquals(
			unwrapErr(result),
			UndeclaredGuardRead({
				job: "site",
				guard: "docs succeeded",
				read: "docs",
			}),
		);
	});

	await t.step("a guard asking outside its declared reads panics", async () => {
		// Given: a hand-written guard that declares version but reads sign
		const sneaky = job({
			name: "sneaky",
			plan: (p) => {
				const v = p.needs(versionJob);
				const s = p.needs(signJob);
				const when = {
					describe: "sign looks fine",
					reads: [v],
					test: (view: OutcomeView) => view.outcome(s).isSucceeded(),
				};
				return { v, s, extra: p.needsIf({ job: versionJob, when }) };
			},
			run: () => {},
		});

		// When: it runs
		const thrown = await run({ jobs: { sneaky } }).then(
			() => undefined,
			(error: unknown) => error,
		);

		// Then: the run rejects with an UndeclaredGuardRead panic
		assertInstanceOf(thrown, Panic);
		assertEquals(thrown.name, "Panic (UndeclaredGuardRead)");
	});
});

Deno.test("runIf decides whether run is called", async (t) => {
	await t.step("failure() runs only when a need is unhealthy", async () => {
		// Given: a notifier over a failing job, and one over a passing job
		const broken = failing("broken");
		const fine = job({ name: "fine", run: () => 1 });
		const notify = job({
			name: "notify",
			plan: (p) => ({ broken: p.needs(broken) }),
			runIf: failure(),
			run: (_t, { broken }) => broken.error().isSome(),
		});
		const quiet = job({
			name: "quiet",
			plan: (p) => ({ fine: p.needs(fine) }),
			runIf: failure(),
			run: () => true,
		});

		// When: both run
		const report = unwrap(await run({ jobs: { notify, quiet } }));

		// Then: the notifier ran with the outcome; the other was Skipped
		assertEquals(report.outcomes.notify, Succeeded(true));
		assertEquals(report.outcomes.quiet, Skipped());
	});

	await t.step("always() runs whatever happened, given outcomes", async () => {
		// Given: a cleanup over a failing job
		const broken = failing("broken");
		const cleanup = job({
			name: "cleanup",
			plan: (p) => ({ broken: p.needs(broken) }),
			runIf: always(),
			run: (_t, { broken }) => broken.isFailed(),
		});

		// When: it runs
		const report = unwrap(await run({ jobs: { cleanup } }));

		// Then: it ran, and saw the failure
		assertEquals(report.outcomes.cleanup, Succeeded(true));
	});

	await t.step(
		"a hand-written runIf gets the context and outcomes",
		async () => {
			// Given: a predicate over the context and the needs' outcomes
			const ctx = defineJobs<{ readonly enabled: boolean }>();
			const build = ctx.job({ name: "build", run: () => "dist" });
			const report = ctx.job({
				name: "report",
				plan: (p) => ({ build: p.needs(build) }),
				runIf: ({ context, needs }) =>
					context.enabled && needs.build.isSucceeded(),
				run: (_t, { build }) => build.value().unwrap(),
			});

			// When: it runs enabled, then disabled
			const on = unwrap(
				await runJobs({ jobs: { report }, context: { enabled: true } }),
			);
			const off = unwrap(
				await runJobs({ jobs: { report }, context: { enabled: false } }),
			);

			// Then: true runs it; false skips it
			assertEquals(on.outcomes.report, Succeeded("dist"));
			assertEquals(off.outcomes.report, Skipped());
		},
	);
});

Deno.test("a hand-written runIf that is false after a cancel ends Skipped", async () => {
	// Given: a predicate that declines to run in a cancelled run
	let started = false;
	const careful = job({
		name: "careful",
		runIf: ({ cancelled }) => !cancelled,
		run: () => {
			started = true;
		},
	});

	// When: the run is cancelled before it starts
	const report = unwrap(
		await run({ jobs: { careful }, signal: AbortSignal.abort() }),
	);

	// Then: a false runIf other than success() is Skipped, not Cancelled
	assertEquals(report.outcomes.careful, Skipped());
	assertEquals(started, false);
});

Deno.test("a guarded field follows its guard, even when its job ran for another need", async () => {
	// Given: one job needed unconditionally and, in the same plan, guarded by
	// a guard that is false
	let ran = 0;
	const build = job({
		name: "build",
		run: () => {
			ran += 1;
			return "dist";
		},
	});
	const deploy = job({
		name: "deploy",
		plan: (p) => {
			const built = p.needs(build);
			return { built, again: p.needsIf({ job: build, when: failed(built) }) };
		},
		run: (_t, { built, again }) => [built, again ?? "left out"],
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { deploy } }));

	// Then: build ran once for the plain need, and the guarded field is
	// undefined, since its own guard was false
	assertEquals(report.outcomes.deploy, Succeeded(["dist", "left out"]));
	assertEquals(ran, 1);
});

Deno.test("under success(), a need's outcome propagates as all() folds it", async () => {
	// Given: a skipped need, and a need on a skipped job
	const skipped = job({ name: "skipped", runIf: failure(), run: () => 1 });
	const after = job({
		name: "after",
		plan: (p) => ({ skipped: p.needs(skipped) }),
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { after } }));

	// Then: the dependent is Skipped, which still passes
	assertEquals(report.outcomes.after, Skipped());
	assert(report.passed);
});

Deno.test("failFast cancels the run when a job fails", async () => {
	// Given: a failing job, a long sibling, a job waiting on it, the failure's
	// dependent, and an always() cleanup
	const events: string[] = [];
	const broken = failing("broken");
	const long = job({ name: "long", run: (t) => untilAborted(t.signal) });
	const later = job({
		name: "later",
		plan: (p) => ({ long: p.needs(long) }),
		run: () => {},
	});
	const dependent = job({
		name: "dependent",
		plan: (p) => ({ broken: p.needs(broken) }),
		run: () => {},
	});
	const cleanup = job({
		name: "cleanup",
		plan: (p) => ({ later: p.needs(later) }),
		runIf: always(),
		run: (t) => t.signal.aborted,
	});

	// When: running with failFast
	const report = unwrap(
		await run({
			jobs: { broken, later, dependent, cleanup },
			failFast: true,
			events,
		}),
	);

	// Then: the running sibling and its waiting dependent are Cancelled
	assertEquals(reached({ report, name: "long" }), Cancelled());
	assertEquals(report.outcomes.later, Cancelled());
	assert(events.includes("Started long"));

	// Then: the failure's own dependent is Blocked, not Cancelled
	assertEquals(report.outcomes.dependent, Blocked(["broken"]));

	// Then: the cleanup still ran, with its signal already aborted
	assertEquals(report.outcomes.cleanup, Succeeded(true));
	assertEquals(report.passed, false);
});

Deno.test("without failFast, siblings of a failure keep running", async () => {
	// Given: a failing job and a slow sibling
	const broken = failing("broken");
	const slow = job({
		name: "slow",
		run: async (t) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return t.signal.aborted;
		},
	});

	// When: running without failFast
	const report = unwrap(await run({ jobs: { broken, slow } }));

	// Then: the sibling finished, never seeing an abort
	assertEquals(report.outcomes.slow, Succeeded(false));
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
				await run({ jobs: { trigger, after }, signal: controller.signal }),
			);

			// Then: the trigger finished, the rest are Cancelled, and the run failed
			assertEquals(report.outcomes.trigger, Succeeded(undefined));
			assertEquals(reached({ report, name: "long" }), Cancelled());
			assertEquals(report.outcomes.after, Cancelled());
			assertEquals(report.passed, false);
		},
	);

	await t.step(
		"aborted before the run, only cancel-proof jobs run",
		async () => {
			// Given: an already-aborted signal, a default job, and three that
			// may run after a cancel
			let started = false;
			const plain = job({
				name: "plain",
				run: () => {
					started = true;
				},
			});
			const cleanup = job({
				name: "cleanup",
				plan: (p) => ({ plain: p.needs(plain) }),
				runIf: always(),
				run: (t) => t.signal.aborted,
			});
			const onCancel = job({
				name: "onCancel",
				runIf: cancelled(),
				run: () => 1,
			});
			const onFailure = job({
				name: "onFailure",
				runIf: failure(),
				run: () => 1,
			});

			// When: running
			const report = unwrap(
				await run({
					jobs: { plain, cleanup, onCancel, onFailure },
					signal: AbortSignal.abort(),
				}),
			);

			// Then: the default job is Cancelled without starting
			assertEquals(report.outcomes.plain, Cancelled());
			assertEquals(started, false);

			// Then: always() and cancelled() ran; failure() found nothing unhealthy
			assertEquals(report.outcomes.cleanup, Succeeded(true));
			assertEquals(report.outcomes.onCancel, Succeeded(1));
			assertEquals(report.outcomes.onFailure, Skipped());
		},
	);
});

Deno.test("only the abort itself makes a body Cancelled", async (t) => {
	await t.step("a real bug thrown after the abort is Failed", async () => {
		// Given: a body that throws its own error once the run is aborted
		const controller = new AbortController();
		const buggy = job({
			name: "buggy",
			run: async (t) => {
				controller.abort("stop");
				await Promise.resolve();
				throw new Error(`bug while ${String(t.signal.reason)}`);
			},
		});

		// When: it runs
		const report = unwrap(
			await run({ jobs: { buggy }, signal: controller.signal }),
		);

		// Then: it Failed with the bug, not Cancelled
		assertInstanceOf(report.outcomes.buggy.error().unwrap(), Error);
	});

	await t.step("an AbortError after the abort is Cancelled", async () => {
		// Given: a body that rejects with an AbortError once the run is aborted
		const controller = new AbortController();
		const fetcher = job({
			name: "fetcher",
			run: () => {
				controller.abort("stop");
				throw new DOMException("aborted", "AbortError");
			},
		});

		// When: it runs
		const report = unwrap(
			await run({ jobs: { fetcher }, signal: controller.signal }),
		);

		// Then: it is Cancelled
		assertEquals(report.outcomes.fetcher, Cancelled());
	});
});

Deno.test("continueOnError exempts a failure from failFast and the verdict", async () => {
	// Given: an optional job that fails, and a slow sibling
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

	// When: running with failFast
	const report = unwrap(
		await run({ jobs: { optional, slow }, failFast: true }),
	);

	// Then: the sibling never saw an abort, and the run passed
	assertEquals(report.outcomes.slow, Succeeded(false));
	assert(report.outcomes.optional.isFailed());
	assert(report.passed);
});

Deno.test("a job blocked by a continueOnError failure still fails the verdict", async () => {
	// Given: a job that needs an optional failure
	const optional = job({
		name: "optional",
		continueOnError: true,
		run: (): number => {
			throw new Error("flaky");
		},
	});
	const after = job({
		name: "after",
		plan: (p) => ({ optional: p.needs(optional) }),
		run: () => {},
	});

	// When: it runs
	const report = unwrap(await run({ jobs: { after } }));

	// Then: the blocked job isn't passing, so neither is the run
	assertEquals(report.outcomes.after, Blocked(["optional"]));
	assertEquals(report.passed, false);
});

Deno.test("an invalid graph is an Err before anything runs", async (t) => {
	await t.step("two jobs with one name", async () => {
		// Given: two different jobs named "build"
		let started = false;
		const first = job({
			name: "build",
			run: () => {
				started = true;
			},
		});
		const second = job({ name: "build", run: () => {} });

		// When: both run
		const result = await run({ jobs: { first, second } });

		// Then: DuplicateName, and nothing started
		assertEquals(unwrapErr(result), DuplicateName("build"));
		assertEquals(started, false);
	});

	await t.step("a cycle through needs", async () => {
		// Given: a needs b, b needs a
		const ref: { a?: Job<void, null> } = {};
		const b = job({
			name: "b",
			plan: (p) => (ref.a === undefined ? {} : { a: p.needs(ref.a) }),
			run: () => {},
		});
		const a = job({
			name: "a",
			plan: (p) => ({ b: p.needs(b) }),
			run: () => {},
		});
		ref.a = a;

		// When: a runs
		const result = await run({ jobs: { a } });

		// Then: the cycle is named, starting and ending with the same job
		assertEquals(unwrapErr(result), Cycle(["a", "b", "a"]));
	});

	await t.step("a cycle through a guarded need", async () => {
		// Given: a pulls b in conditionally, and b needs a
		const ref: { a?: Job<void, null> } = {};
		const seed = job({ name: "seed", run: () => 1 });
		const b = job({
			name: "b",
			plan: (p) => (ref.a === undefined ? {} : { a: p.needs(ref.a) }),
			run: () => {},
		});
		const a = job({
			name: "a",
			plan: (p) => {
				const s = p.needs(seed);
				return { s, b: p.needsIf({ job: b, when: failed(s) }) };
			},
			run: () => {},
		});
		ref.a = a;

		// When: a runs
		const result = await run({ jobs: { a } });

		// Then: the cycle is found, though the guard would be false
		assert(isErr(result));
		assert(isolate(unwrapErr(result), "Cycle"));
	});
});

Deno.test("a plan that throws is a bug, rethrown before anything runs", async () => {
	// Given: a job that would run, and a plan that throws
	let started = false;
	const plain = job({
		name: "plain",
		run: () => {
			started = true;
		},
	});
	const planError = new Error("bad plan");
	const broken = job({
		name: "broken",
		plan: (): PlanRecord => {
			throw planError;
		},
		run: () => {},
	});

	// When: they run
	const thrown = await run({ jobs: { plain, broken } }).then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: the plan's error escaped, and nothing started
	assert(thrown === planError);
	assertEquals(started, false);
});

Deno.test("an untyped caller's non-plain plan panics", async () => {
	// Given: a plan typed as a record that is an array at run time
	const arrayPlan: PlanRecord = JSON.parse("[1]");
	const array = job({ name: "array", plan: () => arrayPlan, run: () => {} });

	// When: it runs
	const thrown = await run({ jobs: { array } }).then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: a NonPlainPlan panic
	assertInstanceOf(thrown, Panic);
	assertEquals(thrown.name, "Panic (NonPlainPlan)");
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
	const deploy = job({ name: "deploy", runIf: failure(), run: () => {} });

	// When: they run
	unwrap(await run({ jobs: { test, deploy }, events }));

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
	const report = unwrap(await run({ jobs: { build }, events }));

	// Then: the step is reported failed, and the job Failed with its error
	assertEquals(events, [
		"Started build",
		"StepStarted build/compile",
		"StepFailed build/compile",
		"Finished build Failed",
	]);
	assert(report.outcomes.build.isFailed());
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
		await run({ jobs: { deploy }, events, signal: controller.signal }),
	);

	// Then: the step is reported failed, and the job Cancelled, not Failed
	assertEquals(events, [
		"Started deploy",
		"StepStarted deploy/upload",
		"StepFailed deploy/upload",
		"Cancelled deploy",
	]);
	assertEquals(report.outcomes.deploy, Cancelled());
});

Deno.test("t.step after the body finished panics", async () => {
	// Given: a body that leaks t.step past its end
	let late: (() => Promise<unknown>) | undefined;
	const leaky = job({
		name: "leaky",
		run: (t) => {
			late = () => t.step({ name: "late", run: () => {} });
		},
	});
	unwrap(await run({ jobs: { leaky } }));

	// When: the leaked step is called
	const thrown = await late?.().then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: a StepAfterFinish panic
	assertInstanceOf(thrown, Panic);
	assertEquals(thrown.name, "Panic (StepAfterFinish)");
});

Deno.test("a throwing onEvent cancels the run instead of orphaning jobs", async () => {
	// Given: a quick job whose Finished event makes the hook throw, a sibling
	// that waits for its signal, and the caller's signal
	let sawAbort = false;
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
		jobs: { quick, sibling },
		context: null,
		signal: controller.signal,
		onEvent: (event) => {
			if (isolate(event, "Finished")) throw hookError;
		},
	}).then(
		() => undefined,
		(error: unknown) => error,
	);

	// Then: the sibling saw its signal abort, runJobs rejected with the bug,
	// and no listener leaked onto the caller's signal
	assertEquals(sawAbort, true);
	assert(thrown === hookError);
	assertEquals(listeners, 0);
});

Deno.test("a throwing runIf or guard is a bug: the run winds down, then rethrows", async (t) => {
	for (const where of ["runIf", "guard"] as const) {
		await t.step(`a throwing ${where}`, async () => {
			// Given: a sibling that waits for its signal, and a job whose
			// decision throws
			let sawAbort = false;
			const decisionError = new Error(`${where} bug`);
			const seed = job({ name: "seed", run: () => 1 });
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
			const decider = job({
				name: "decider",
				plan: (p) => {
					const s = p.needs(seed);
					if (where === "runIf") return { s };
					const when = {
						describe: "throws",
						reads: [s],
						test: (): boolean => {
							throw decisionError;
						},
					};
					return { s, extra: p.needsIf({ job: seed, when }) };
				},
				runIf: () => {
					if (where === "runIf") throw decisionError;
					return true;
				},
				run: () => {},
			});

			// When: they run
			const thrown = await run({ jobs: { sibling, decider } }).then(
				() => undefined,
				(error: unknown) => error,
			);

			// Then: the sibling saw the abort, and runJobs rejected with the bug
			assertEquals(sawAbort, true);
			assert(thrown === decisionError);
		});
	}
});
