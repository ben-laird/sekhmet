/**
 * {@linkcode runJobs}: runs a job graph once, from its roots.
 *
 * @module
 */

import { isolate, union } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { panic } from "@sekhmet/panic/mini/core";
import { getStructParams } from "@sekhmet/primordials/struct";
import { JobEvent } from "@/src/event.ts";
import { settleAll, trackGraph } from "@/src/graph.ts";
import type { GraphError } from "@/src/graph-error.ts";
import {
	type AnyJob,
	Handle,
	type HandleReader,
	type Job,
	type JobRun,
	nameOf,
} from "@/src/job.ts";
import {
	Cancelled,
	Failed,
	type JobOutcome,
	Skipped,
	Succeeded,
} from "@/src/outcome.ts";
import { openPlanner } from "@/src/planner.ts";
import { decideFromNeeds, passed } from "@/src/verdict.ts";

/**
 * What {@linkcode runJobs} takes.
 *
 * @template C The run's context type
 */
export interface RunOptions<C> {
	/** The roots; every job they reach runs once */
	readonly jobs: readonly Job<unknown, C>[];
	/** The run's read-only context, shared by every plan and body */
	readonly context: C;
	/** Cancels the whole run when aborted */
	readonly signal?: AbortSignal | undefined;
	/**
	 * When a job fails (without `continueOnError`), abort the rest through
	 * their signals; jobs not yet started end `Cancelled` (default `false`)
	 */
	readonly failFast?: boolean | undefined;
	/** Receives each {@linkcode JobEvent} as it happens; must not throw */
	readonly onEvent?: ((event: JobEvent) => void) | undefined;
}

/**
 * What a run that formed a valid graph reports.
 */
export interface RunReport {
	/**
	 * No job `Failed` without `continueOnError`, and none was `Cancelled`.
	 */
	readonly passed: boolean;
	/** Every job's outcome, by name, in the order the run reached them */
	readonly outcomes: ReadonlyMap<string, JobOutcome<unknown>>;
}

/**
 * The cause of a panic for a handle the run can't resolve: one returned by a
 * plan that didn't declare it, or a `t.step` after its body ended.
 */
export interface JobMisuseCause {
	/** The job whose plan or body misused the handle or step */
	readonly job: string;
}

/**
 * Runs every job reachable from `jobs`, each once however many jobs need it.
 *
 * The runner calls each job's plan as soon as a plan (or the roots) reaches
 * it. A body starts only when every handle its plan declared has resolved;
 * a failed or blocked need makes the job `Blocked` without starting it. A
 * throw or rejection in a plan or body becomes `Failed` and is never
 * rethrown. Unrelated jobs keep running after a failure, unless `failFast`.
 *
 * A duplicate name or a cycle (across `needs` and plan awaits) cancels the
 * run, and the result is that `Err`.
 *
 * @param options The roots, the context, and how to watch and stop the run
 * @returns The report, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { isolate } from "@sekhmet/enum/core/mini";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { defineJobs, runJobs } from "@sekhmet/job";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs<null>();
 * const lint = job({
 * 	name: "lint",
 * 	run: () => {
 * 		throw new Error("unused variable");
 * 	},
 * });
 * const test = job({
 * 	name: "test",
 * 	plan: (p) => ({ lint: p.needs(lint) }),
 * 	run: () => "tests passed",
 * });
 *
 * const report = unwrap(await runJobs({ jobs: [test], context: null }));
 * assertEquals(report.passed, false);
 * const outcome = report.outcomes.get("test");
 * assert(outcome !== undefined && isolate(outcome, "Blocked"));
 * ```
 */
export async function runJobs<C>({
	jobs,
	context,
	signal,
	failFast = false,
	onEvent = () => {},
}: RunOptions<C>): Promise<Result<RunReport, GraphError>> {
	const graph = trackGraph();
	const cancel = new AbortController();
	const cancelled = new Promise<void>((resolve) => {
		cancel.signal.addEventListener("abort", () => resolve(), { once: true });
	});
	const runs = new Map<AnyJob, Promise<JobOutcome<unknown>>>();
	const settled = new Map<AnyJob, JobOutcome<unknown>>();
	let graphError: GraphError | undefined;

	const forwardAbort = (): void => cancel.abort(signal?.reason);
	if (signal?.aborted) forwardAbort();
	signal?.addEventListener("abort", forwardAbort, { once: true });

	try {
		for (const root of jobs) void schedule(root);
		await settleAll(runs);
	} finally {
		// Even when onEvent throws, which it must not, leave the caller's
		// signal as it was
		signal?.removeEventListener("abort", forwardAbort);
	}

	if (graphError !== undefined) return Err(graphError);
	return Ok({
		passed: passed(
			[...settled].map(([job, outcome]) => {
				return {
					outcome,
					continueOnError: getStructParams(job).continueOnError,
				};
			}),
		),
		outcomes: new Map(
			[...runs.keys()].flatMap((job) => {
				const outcome = settled.get(job);
				return outcome === undefined ? [] : [[nameOf(job), outcome] as const];
			}),
		),
	});

	function fail(error: GraphError): void {
		graphError ??= error;
		cancel.abort(error);
	}

	function schedule<T>(job: Job<T, C>): Promise<JobOutcome<T>> {
		const known = runs.get(job);
		if (known !== undefined) return recallUnsafely({ job, known });

		const discovered = graph.discover(job);
		if (isErr(discovered)) {
			fail(unwrapErr(discovered));
			return Promise.resolve(Cancelled());
		}
		// Reserve the slot first: the plan may reach other jobs synchronously
		const outcome = Promise.withResolvers<JobOutcome<T>>();
		runs.set(job, outcome.promise);
		outcome.resolve(lifecycle(job));
		return outcome.promise;
	}

	function depend<T>({
		from,
		to,
	}: {
		from: AnyJob;
		to: Job<T, C>;
	}): Promise<JobOutcome<T>> {
		const linked = graph.link({ from, to });
		if (isErr(linked)) {
			fail(unwrapErr(linked));
			return Promise.resolve(Cancelled());
		}
		return schedule(to);
	}

	/**
	 * One job's way through a run: plan, wait for every job the plan touched,
	 * decide, then run the body if nothing forced an outcome. Waiting for all
	 * of them first is what puts each job's terminal event after theirs.
	 */
	async function lifecycle<T>(job: Job<T, C>): Promise<JobOutcome<T>> {
		const { name, plan } = getStructParams(job);
		const stopped = Promise.withResolvers<void>();
		const dependencies = new Map<AnyJob, Dependency>();

		const touch = <U>({
			need,
			blocks,
		}: {
			need: Job<U, C>;
			blocks: boolean;
		}): Promise<JobOutcome<U>> => {
			const outcome = depend({ from: job, to: need });
			const known = dependencies.get(need)?.blocks ?? false;
			dependencies.set(need, { outcome, blocks: blocks || known });
			return outcome;
		};

		const { planner, close } = openPlanner<C>({
			job: name,
			context,
			needs: (need) => {
				void touch({ need, blocks: true });
				return new Handle({ job: need });
			},
			result: async (need) => {
				const outcome = await touch({ need, blocks: true });
				if (isolate(outcome, "Succeeded")) return union(outcome);
				stopped.resolve();
				return new Promise<never>(() => {});
			},
			outcome: (need) => touch({ need, blocks: false }),
		});

		type Planned =
			| {
					readonly kind: "stage";
					readonly stage: Awaited<ReturnType<typeof plan>>;
			  }
			| { readonly kind: "failed"; readonly error: unknown }
			| { readonly kind: "stopped" };
		const planned = await Promise.race<Planned>([
			plan(planner).then(
				(stage) => ({ kind: "stage", stage }),
				(error: unknown) => ({ kind: "failed", error }),
			),
			stopped.promise.then(() => ({ kind: "stopped" })),
			cancelled.then(() => ({ kind: "stopped" })),
		]);
		close();

		const settledNeeds = await Promise.all(
			[...dependencies].map(async ([need, { outcome, blocks }]) => {
				return { name: nameOf(need), outcome: await outcome, blocks };
			}),
		);
		const forced = decideFromNeeds(settledNeeds.filter(({ blocks }) => blocks));

		if (planned.kind === "failed") {
			return finish({ job, outcome: Failed(planned.error) });
		}
		if (planned.kind === "stopped") {
			return finish({ job, outcome: forced ?? Cancelled() });
		}
		if (planned.stage.kind === "skip") {
			return finish({ job, outcome: Skipped() });
		}
		if (forced !== undefined) return finish({ job, outcome: forced });
		if (cancel.signal.aborted) return finish({ job, outcome: Cancelled() });

		onEvent(new JobEvent("Started", { job: name }));
		const outcome = await body({
			name,
			run: planned.stage.run,
			touched: new Set(dependencies.keys()),
		});
		return finish({ job, outcome });
	}

	async function body<T>({
		name,
		run,
		touched,
	}: {
		name: string;
		run: (t: JobRun<C>, read: HandleReader) => Promise<T>;
		touched: ReadonlySet<AnyJob>;
	}): Promise<JobOutcome<T>> {
		let running = true;
		const read: HandleReader = (handle) => {
			const { job: need } = getStructParams(handle);
			const outcome = touched.has(need) ? settled.get(need) : undefined;
			if (outcome !== undefined && isolate(outcome, "Succeeded")) {
				return valueOfUnsafely({ handle, value: union(outcome) });
			}
			return panic<JobMisuseCause>({
				name: "UndeclaredHandle",
				message: `job "${name}" returned a handle its own plan did not declare`,
				cause: { job: name },
			});
		};
		const t: JobRun<C> = {
			context,
			signal: cancel.signal,
			step: async (step, fn) => {
				if (!running) {
					panic<JobMisuseCause>({
						name: "StepAfterFinish",
						message: `t.step("${step}") was called after job "${name}" finished`,
						cause: { job: name },
					});
				}
				onEvent(new JobEvent("StepStarted", { job: name, step }));
				try {
					const value = await fn();
					onEvent(
						new JobEvent("StepFinished", {
							job: name,
							step,
							result: Ok(undefined),
						}),
					);
					return value;
				} catch (error) {
					onEvent(
						new JobEvent("StepFinished", {
							job: name,
							step,
							result: Err(error),
						}),
					);
					throw error;
				}
			},
		};

		try {
			return Succeeded(await run(t, read));
		} catch (error) {
			return cancel.signal.aborted ? Cancelled() : Failed(error);
		} finally {
			running = false;
		}
	}

	function finish<T>({
		job,
		outcome,
	}: {
		job: Job<T, C>;
		outcome: JobOutcome<T>;
	}): JobOutcome<T> {
		const { name, continueOnError } = getStructParams(job);
		settled.set(job, outcome);
		onEvent(terminalEvent({ job: name, outcome }));
		if (failFast && isolate(outcome, "Failed") && !continueOnError) {
			cancel.abort(new Error(`failFast: job "${name}" failed`));
		}
		return outcome;
	}
}

/** A job a plan touched, and whether its failure blocks the plan's job. */
interface Dependency {
	/** The touched job's outcome in this run */
	readonly outcome: Promise<JobOutcome<unknown>>;
	/** `true` for `p.needs` and `p.result`, `false` for `p.outcome` alone */
	readonly blocks: boolean;
}

function terminalEvent({
	job,
	outcome,
}: {
	job: string;
	outcome: JobOutcome<unknown>;
}): JobEvent {
	if (isolate(outcome, "Skipped")) return new JobEvent("Skipped", { job });
	if (isolate(outcome, "Cancelled")) return new JobEvent("Cancelled", { job });
	if (isolate(outcome, "Blocked")) {
		return new JobEvent("Blocked", { job, blockedBy: union(outcome) });
	}
	return new JobEvent("Finished", { job, outcome });
}

/**
 * Reads a job's outcome back out of the run's memo.
 *
 * A cast: a `Map` can't relate each key's `T` to its value's, but `schedule`
 * stores only `lifecycle(job)` under `job`, so the value's `T` is the key's.
 * The same holds for `valueOfUnsafely`.
 */
function recallUnsafely<T>({
	known,
}: {
	job: Job<T, never>;
	known: Promise<JobOutcome<unknown>>;
}): Promise<JobOutcome<T>> {
	return known as Promise<JobOutcome<T>>;
}

/**
 * The succeeded value of a handle's job, read from the run's settled map.
 *
 * A cast for the reason `recallUnsafely` gives: `finish` stores only a job's
 * own outcome under it, so the value read for `handle`'s job is its `T`.
 */
function valueOfUnsafely<U>({
	value,
}: {
	handle: Handle<U>;
	value: unknown;
}): Readonly<U> {
	return value as Readonly<U>;
}
