/**
 * The context factory and per-job cleanup: each job that starts gets its
 * own context, built from the run's metadata just before its `run`, and its
 * own cleanup stack, shared by the factory and `run`, disposed once `run`
 * settles.
 */

import { match } from "@sekhmet/enum/core/mini";
import { unwrap } from "@sekhmet/enum/result/mini";
import {
	always,
	Blocked,
	Cancelled,
	defineJobs,
	failure,
	type JobEvent,
	runJobs,
	Skipped,
	Succeeded,
} from "@sekhmet/job";
import { Panic } from "@sekhmet/panic/mini/core";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";

interface Meta {
	/** Where the factory records each job it built a context for */
	readonly built: string[];
}

/** A kit whose factory records its calls and gives each job a fresh log. */
function recordingKit() {
	return defineJobs((meta: Meta, { job }) => {
		meta.built.push(job);
		const log: string[] = [];
		return { job, log };
	});
}

Deno.test("each job that starts builds its own context, once", async () => {
	// Given: two jobs that each write to their context, one needing the other
	const { job } = recordingKit();
	const first = job({
		name: "first",
		run: (r) => {
			r.ctx.log.push("first wrote");
			return [...r.ctx.log];
		},
	});
	const second = job({
		name: "second",
		plan: (p) => ({ first: p.needs(first) }),
		run: (r) => {
			r.ctx.log.push("second wrote");
			return [...r.ctx.log];
		},
	});
	const meta: Meta = { built: [] };

	// When: both run, second reached through two roots
	const report = unwrap(
		await runJobs({ jobs: { second, again: second, first }, meta }),
	);

	// Then: each job saw only its own writes, and each context was built once
	assertEquals(report.outcomes.first, Succeeded(["first wrote"]));
	assertEquals(report.outcomes.second, Succeeded(["second wrote"]));
	assertEquals([...meta.built].sort(), ["first", "second"]);
});

Deno.test("the factory gets the run's meta and the job's name", async () => {
	// Given: a job whose run reads the context the factory made
	const { job } = recordingKit();
	const named = job({ name: "named", run: (r) => r.ctx.job });
	const meta: Meta = { built: [] };

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { named }, meta }));

	// Then: the factory was called with the job's display name
	assertEquals(report.outcomes.named, Succeeded("named"));
	assertEquals(meta.built, ["named"]);
});

Deno.test("r.meta is the value runJobs was given", async () => {
	// Given: a job returning its meta
	const { job } = recordingKit();
	const echo = job({ name: "echo", run: (r) => r.meta });
	const meta: Meta = { built: [] };

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { echo }, meta }));

	// Then: it is the same object
	assertStrictEquals(report.outcomes.echo.value().unwrap(), meta);
});

Deno.test("a job that never starts never builds a context", async () => {
	// Given: a failing job, a dependent it blocks, and a failure() job it skips
	const { job } = recordingKit();
	const broken = job({
		name: "broken",
		run: () => {
			throw new Error("broke");
		},
	});
	const blocked = job({
		name: "blocked",
		plan: (p) => ({ broken: p.needs(broken) }),
		run: () => {},
	});
	const ok = job({ name: "ok", run: () => {} });
	const skipped = job({
		name: "skipped",
		plan: (p) => ({ ok: p.needs(ok) }),
		runIf: failure(),
		run: () => {},
	});
	const meta: Meta = { built: [] };

	// When: they run
	const report = unwrap(await runJobs({ jobs: { blocked, skipped }, meta }));

	// Then: only the jobs that started built a context
	assertEquals(report.outcomes.blocked, Blocked(["broken"]));
	assertEquals(report.outcomes.skipped, Skipped());
	assertEquals([...meta.built].sort(), ["broken", "ok"]);
});

Deno.test("a job cancelled before it starts never builds a context", async (t) => {
	await t.step("by failFast, after a sibling fails", async () => {
		// Given: a failing job, a long sibling, and a job waiting on the sibling
		const { job } = recordingKit();
		const broken = job({
			name: "broken",
			run: () => {
				throw new Error("broke");
			},
		});
		const long = job({ name: "long", run: (r) => untilAborted(r.signal) });
		const later = job({
			name: "later",
			plan: (p) => ({ long: p.needs(long) }),
			run: () => {},
		});
		const meta: Meta = { built: [] };

		// When: they run with failFast
		const report = unwrap(
			await runJobs({ jobs: { broken, later }, meta, failFast: true }),
		);

		// Then: later was cancelled before it started, and built no context
		assertEquals(report.outcomes.later, Cancelled());
		assertEquals([...meta.built].sort(), ["broken", "long"]);
	});

	await t.step("by a signal aborted before the run", async () => {
		// Given: a default job and an already-aborted signal
		const { job } = recordingKit();
		const plain = job({ name: "plain", run: () => {} });
		const meta: Meta = { built: [] };

		// When: the run starts
		const report = unwrap(
			await runJobs({
				jobs: { plain },
				meta,
				signal: AbortSignal.abort(new Error("stop")),
			}),
		);

		// Then: the job is Cancelled and the factory was never called
		assertEquals(report.outcomes.plain, Cancelled());
		assertEquals(meta.built, []);
	});
});

Deno.test("a factory that throws fails its job, and only its job", async () => {
	// Given: a factory that throws for one job
	const boom = new Error("no connection");
	const { job } = defineJobs((_meta: null, { job }) => {
		if (job === "doomed") throw boom;
		return {};
	});
	let ran = false;
	const doomed = job({
		name: "doomed",
		run: () => {
			ran = true;
		},
	});
	const fine = job({ name: "fine", run: () => "fine" });

	// When: both run
	const report = unwrap(await runJobs({ jobs: { doomed, fine }, meta: null }));

	// Then: the doomed job failed with the throw, before its run; fine ran
	assert(report.outcomes.doomed.isFailed());
	assertStrictEquals(report.outcomes.doomed.error().unwrap(), boom);
	assertEquals(ran, false);
	assertEquals(report.outcomes.fine, Succeeded("fine"));
});

/** Rejects with the signal's reason once it aborts. */
function untilAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) reject(signal.reason);
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}

/** An event as one line: its kind and its job. */
function line(event: JobEvent): string {
	return match(event)({
		Started: ({ job }) => `Started ${job}`,
		StepStarted: ({ job, step }) => `StepStarted ${job}/${step}`,
		StepSucceeded: ({ job, step }) => `StepSucceeded ${job}/${step}`,
		StepFailed: ({ job, step }) => `StepFailed ${job}/${step}`,
		Finished: ({ job }) => `Finished ${job}`,
		Skipped: ({ job }) => `Skipped ${job}`,
		Blocked: ({ job }) => `Blocked ${job}`,
		Cancelled: ({ job }) => `Cancelled ${job}`,
	});
}

/** A kit whose factory registers one cleanup per job, recording into `log`. */
function cleaningKit() {
	return defineJobs((meta: { readonly log: string[] }, { job, cleanup }) => {
		cleanup.defer(() => {
			meta.log.push(`dispose ${job} factory`);
		});
		return { log: meta.log };
	});
}

Deno.test("cleanup disposes LIFO, the factory's registrations last", async () => {
	// Given: a factory registering two cleanups, and a run registering one
	const log: string[] = [];
	const { job } = defineJobs(
		(meta: { readonly log: string[] }, { cleanup }) => {
			cleanup.defer(() => {
				meta.log.push("factory first");
			});
			cleanup.adopt("pool", (pool) => {
				meta.log.push(`factory second (${pool})`);
			});
			return {};
		},
	);
	const work = job({
		name: "work",
		run: (r) => {
			r.cleanup.use({
				[Symbol.dispose]: () => {
					r.meta.log.push("run's resource");
				},
			});
			r.meta.log.push("run");
		},
	});

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { work }, meta: { log } }));

	// Then: the run's resource went first, then the factory's, in reverse
	assertEquals(report.outcomes.work, Succeeded(undefined));
	assertEquals(log, [
		"run",
		"run's resource",
		"factory second (pool)",
		"factory first",
	]);
});

Deno.test("cleanup runs however run settles", async (t) => {
	await t.step("on success and on failure", async () => {
		// Given: one job that succeeds and one that throws
		const log: string[] = [];
		const { job } = cleaningKit();
		const fine = job({ name: "fine", run: () => "ok" });
		const broken = job({
			name: "broken",
			run: () => {
				throw new Error("broke");
			},
		});

		// When: both run
		const report = unwrap(
			await runJobs({ jobs: { fine, broken }, meta: { log } }),
		);

		// Then: both disposed, and the failure is the body's own error
		assertEquals(report.outcomes.fine, Succeeded("ok"));
		assert(report.outcomes.broken.isFailed());
		assertEquals([...log].sort(), [
			"dispose broken factory",
			"dispose fine factory",
		]);
	});

	await t.step("on cancellation, and for always() jobs after it", async () => {
		// Given: a long job, and an always() job that needs it
		const log: string[] = [];
		const { job } = cleaningKit();
		const long = job({
			name: "long",
			run: (r) => untilAborted(r.signal),
		});
		const after = job({
			name: "after",
			plan: (p) => ({ long: p.needs(long) }),
			runIf: always(),
			run: (r, { long }) => {
				r.cleanup.defer(() => {
					r.meta.log.push(`after saw ${r.signal.aborted ? "abort" : "none"}`);
				});
				return long.isCancelled();
			},
		});
		const controller = new AbortController();
		setTimeout(() => controller.abort(new Error("stop")), 5);

		// When: the run is cancelled while long runs
		const report = unwrap(
			await runJobs({
				jobs: { after },
				meta: { log },
				signal: controller.signal,
			}),
		);

		// Then: long ended Cancelled and was disposed; after ran and was disposed
		assertEquals(report.all.get("long"), Cancelled());
		assertEquals(report.outcomes.after, Succeeded(true));
		assertEquals(log, [
			"dispose long factory",
			"after saw abort",
			"dispose after factory",
		]);
	});
});

Deno.test("disposal ends before the terminal event and any dependent", async () => {
	// Given: a job with a slow async cleanup, and a dependent
	const log: string[] = [];
	const { job } = defineJobs((meta: { readonly log: string[] }) => meta);
	const first = job({
		name: "first",
		run: (r) => {
			r.cleanup.defer(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				r.ctx.log.push("first disposed");
			});
			return "value";
		},
	});
	const second = job({
		name: "second",
		plan: (p) => ({ first: p.needs(first) }),
		run: (r, { first }) => {
			r.ctx.log.push(`second got ${first}`);
		},
	});

	// When: they run, logging events beside the cleanup
	unwrap(
		await runJobs({
			jobs: { second },
			meta: { log },
			onEvent: (event) => {
				log.push(line(event));
			},
		}),
	);

	// Then: first was disposed before its Finished, and before second started
	assertEquals(log, [
		"Started first",
		"first disposed",
		"Finished first",
		"Started second",
		"second got value",
		"Finished second",
	]);
});

Deno.test("runJobs resolves only once every job is disposed", async () => {
	// Given: a job whose cleanup takes a while
	let disposed = false;
	const { job } = defineJobs(() => ({}));
	const slow = job({
		name: "slow",
		run: (r) => {
			r.cleanup.defer(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				disposed = true;
			});
		},
	});

	// When: the run resolves
	await runJobs({ jobs: { slow }, meta: null });

	// Then: the cleanup had finished
	assert(disposed);
});

Deno.test("a cleanup that throws fails its job", async (t) => {
	await t.step("after a successful body", async () => {
		// Given: a body that succeeds, and a cleanup that throws
		const close = new Error("close failed");
		const { job } = defineJobs(() => ({}));
		const leaky = job({
			name: "leaky",
			run: (r) => {
				r.cleanup.defer(() => {
					throw close;
				});
				return "value";
			},
		});

		// When: it runs
		const report = unwrap(await runJobs({ jobs: { leaky }, meta: null }));

		// Then: the job is Failed with the cleanup's error, and the run fails
		assertStrictEquals(report.outcomes.leaky.error().unwrap(), close);
		assertEquals(report.passed, false);
	});

	await t.step("keeping the body's error as suppressed", async () => {
		// Given: a body that throws, and a cleanup that throws too
		const body = new Error("body broke");
		const close = new Error("close failed");
		const { job } = defineJobs(() => ({}));
		const doubly = job({
			name: "doubly",
			run: (r) => {
				r.cleanup.defer(() => {
					throw close;
				});
				throw body;
			},
		});

		// When: it runs
		const report = unwrap(await runJobs({ jobs: { doubly }, meta: null }));

		// Then: the error is a SuppressedError: the cleanup's over the body's
		const error = report.outcomes.doubly.error().unwrap();
		assertInstanceOf(error, SuppressedError);
		assertStrictEquals(error.error, close);
		assertStrictEquals(error.suppressed, body);
	});

	await t.step("chaining several cleanup errors", async () => {
		// Given: a body that throws, and two cleanups that throw
		const body = new Error("body");
		const early = new Error("registered first");
		const late = new Error("registered last");
		const { job } = defineJobs(() => ({}));
		const chained = job({
			name: "chained",
			run: (r) => {
				r.cleanup.defer(() => {
					throw early;
				});
				r.cleanup.defer(() => {
					throw late;
				});
				throw body;
			},
		});

		// When: it runs
		const report = unwrap(await runJobs({ jobs: { chained }, meta: null }));

		// Then: each later disposal's error wraps the one before
		const outer = report.outcomes.chained.error().unwrap();
		assertInstanceOf(outer, SuppressedError);
		assertStrictEquals(outer.error, early);
		const inner = outer.suppressed;
		assertInstanceOf(inner, SuppressedError);
		assertStrictEquals(inner.error, late);
		assertStrictEquals(inner.suppressed, body);
	});

	await t.step("even when the body was cancelled", async () => {
		// Given: a body cancelled by the run's signal, and a cleanup that throws
		const close = new Error("close failed");
		const reason = new Error("stop");
		const { job } = defineJobs(() => ({}));
		const cancelled = job({
			name: "cancelled",
			run: (r) => {
				r.cleanup.defer(() => {
					throw close;
				});
				return untilAborted(r.signal);
			},
		});
		const controller = new AbortController();
		setTimeout(() => controller.abort(reason), 5);

		// When: the run is cancelled
		const report = unwrap(
			await runJobs({
				jobs: { cancelled },
				meta: null,
				signal: controller.signal,
			}),
		);

		// Then: Failed, the abort kept as the suppressed error
		const error = report.outcomes.cancelled.error().unwrap();
		assertInstanceOf(error, SuppressedError);
		assertStrictEquals(error.error, close);
		assertStrictEquals(error.suppressed, reason);
	});

	await t.step("which continueOnError forgives, as any failure", async () => {
		// Given: a continueOnError job whose cleanup throws
		const { job } = defineJobs(() => ({}));
		const tolerated = job({
			name: "tolerated",
			continueOnError: true,
			run: (r) => {
				r.cleanup.defer(() => {
					throw new Error("close failed");
				});
			},
		});

		// When: it runs
		const report = unwrap(await runJobs({ jobs: { tolerated }, meta: null }));

		// Then: it failed, but the run passes
		assert(report.outcomes.tolerated.isFailed());
		assert(report.passed);
	});
});

Deno.test("r.cleanup.use disposes sync, async and absent resources", async () => {
	// Given: a run using a sync resource, an async one and null
	const log: string[] = [];
	const { job } = defineJobs((meta: { readonly log: string[] }) => meta);
	const work = job({
		name: "work",
		run: (r) => {
			r.cleanup.use({
				[Symbol.dispose]: () => {
					r.ctx.log.push("sync");
				},
			});
			r.cleanup.use({
				[Symbol.asyncDispose]: async () => {
					await Promise.resolve();
					r.ctx.log.push("async");
				},
			});
			r.cleanup.use(null);
		},
	});

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { work }, meta: { log } }));

	// Then: both were disposed, last used first
	assertEquals(report.outcomes.work, Succeeded(undefined));
	assertEquals(log, ["async", "sync"]);
});

Deno.test("registering a cleanup after the job's disposal panics", async () => {
	// Given: a body that leaks r.cleanup past its end
	let late: (() => void) | undefined;
	const { job } = defineJobs(() => ({}));
	const leaky = job({
		name: "leaky",
		run: (r) => {
			late = () => r.cleanup.defer(() => {});
		},
	});
	unwrap(await runJobs({ jobs: { leaky }, meta: null }));

	// When: the leaked cleanup is used
	const register = (): void => late?.();

	// Then: a CleanupAfterDispose panic
	const thrown = assertThrows(register, Panic);
	assertEquals(thrown.name, "Panic (CleanupAfterDispose)");
});

Deno.test("a factory that throws after registering disposes what it registered", async () => {
	// Given: a factory that opens something, registers it, then throws
	const log: string[] = [];
	const boom = new Error("half-built");
	const { job } = defineJobs(
		(meta: { readonly log: string[] }, { cleanup }) => {
			cleanup.defer(() => {
				meta.log.push("closed");
			});
			throw boom;
		},
	);
	const doomed = job({
		name: "doomed",
		run: (r) => {
			r.meta.log.push("ran");
		},
	});

	// When: it runs
	const report = unwrap(await runJobs({ jobs: { doomed }, meta: { log } }));

	// Then: the job failed with the factory's throw, after closing what it opened
	assertStrictEquals(report.outcomes.doomed.error().unwrap(), boom);
	assertEquals(log, ["closed"]);
});
