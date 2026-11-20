/**
 * {@linkcode runJobs}: runs a job graph once, from a record of roots.
 *
 * @module
 */

import { union } from "@sekhmet/enum/core/mini";
import { Ok, type Result } from "@sekhmet/enum/result/mini";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrap } from "@sekhmet/enum/result/mini/unwrap";
import { panic } from "@sekhmet/panic/mini/core";
import { getStructParams } from "@sekhmet/primordials/struct";
import { cleanupStack } from "@/src/cleanup.ts";
import type { NeedEnds } from "@/src/condition.ts";
import {
	Cancelled,
	Failed,
	JobEnd,
	Skipped,
	Succeeded,
} from "@/src/end/main/mod.ts";
import { unmet } from "@/src/end/mini/fold.ts";
import { unerased } from "@/src/erasure.ts";
import { JobEvent } from "@/src/event.ts";
import {
	type GraphNode,
	type NodeNeed,
	planGraph,
	sameJob,
} from "@/src/graph.ts";
import type {
	GraphError,
	UndeclaredGuardReadCause,
} from "@/src/graph-error.ts";
import type { BoundJob, Job, Roots, StepDefinition } from "@/src/job.ts";
import type { AnyNeed, EndView, Guard } from "@/src/need.ts";
import { resolveNeeds } from "@/src/plan-data.ts";
import { type CountedEnd, passed } from "@/src/verdict.ts";

/**
 * What {@linkcode runJobs} takes.
 *
 * @template M The run's metadata type
 * @template J The roots
 */
export interface RunOptions<M, J extends Roots<M>> {
	/** The roots, by key; every job they reach runs once */
	readonly jobs: J;
	/**
	 * The run's metadata, shared by every plan, `runIf`, context factory and
	 * body. It is the caller's: a shared resource in it (a pool) is the
	 * caller's to dispose once `runJobs` resolves
	 */
	readonly meta: M;
	/** Cancels the whole run when aborted */
	readonly signal?: AbortSignal | undefined;
	/**
	 * When a job fails (without `continueOnError`), cancel the run (default
	 * `false`): running bodies see their signal abort, and jobs not yet
	 * started run only if their `runIf` holds for a cancelled run
	 */
	readonly failFast?: boolean | undefined;
	/**
	 * Receives each {@linkcode JobEvent} as it happens. It must not throw: a
	 * throw cancels the run, the hook gets no more events, and `runJobs`
	 * rejects with it once every job has settled
	 */
	readonly onEvent?: ((event: JobEvent) => void) | undefined;
}

/**
 * What {@linkcode runJobs} takes when every root's metadata type accepts
 * `undefined` (a factory that ignores its parameter, or annotates it
 * `Config | undefined`): `meta` may be omitted.
 *
 * @template J The roots
 */
export interface OptionalMetaRunOptions<J extends Roots<undefined>>
	extends Omit<RunOptions<undefined, J>, "meta"> {
	/**
	 * The run's metadata: omitted, every plan, `runIf`, context factory and
	 * body reads `undefined`
	 */
	readonly meta?: undefined;
}

/**
 * The roots' {@linkcode JobEnd}s, keyed as the roots were, each typed by its job, as
 * `Promise.all` types its input.
 *
 * @template J The roots
 */
export type JobEnds<J> = {
	readonly [K in keyof J]: J[K] extends Job<infer T, never>
		? JobEnd<Readonly<T>>
		: never;
};

/**
 * What a run that formed a valid graph reports.
 *
 * @template J The roots
 */
export interface RunReport<J> {
	/** Each root's outcome, under its key, typed */
	readonly outcomes: JobEnds<J>;
	/** Every job the run reached, by name, in the order they settled */
	readonly all: ReadonlyMap<string, JobEnd<unknown>>;
	/**
	 * Every job reached is passing (`Succeeded` or `Skipped`), or `Failed`
	 * with `continueOnError`
	 */
	readonly passed: boolean;
}

/**
 * The cause of the panic for a `r.step` called after its job finished.
 */
export interface JobMisuseCause {
	/** The job whose body misused the step */
	readonly job: string;
}

/**
 * Runs every job reachable from `jobs`, each identity once however many
 * jobs need it.
 *
 * The runner first calls every reachable plan (they are pure), so a
 * `GraphError` (a duplicate name or family key, a guard reading outside its
 * plan, a cycle) is an `Err` before anything starts, and a plan that throws
 * is rethrown before anything starts. Then each job:
 *
 * 1. waits for its unconditional needs;
 * 2. tests each `needsIf` guard against them, and waits for those it pulls
 *    in;
 * 3. tests its `runIf` (the default is `success()`):
 *    - under `success()`, a job whose needs aren't all successful ends with
 *      exactly the outcome `all` gives them (`Blocked`, `Cancelled` or
 *      `Skipped`), and one whose needs succeeded ends `Cancelled` if the run
 *      was cancelled;
 *    - any other `runIf` that is false ends the job `Skipped`;
 * 4. builds its context with its kit's factory, and runs its body. A throw
 *    or rejection (from either) is `Failed`, never rethrown, except the
 *    abort itself after a cancel (the signal's `reason`, or an
 *    `AbortError`), which is `Cancelled`;
 * 5. disposes its cleanup stack, LIFO, however the body settled. A cleanup
 *    that throws makes the job `Failed`; if the body threw too, the error
 *    is a `SuppressedError` (the cleanup's error over the body's), as are
 *    several cleanup throws, each over the one before. Disposal ends before
 *    the job's terminal event and before any dependent starts, and
 *    `runJobs` resolves only once every job is disposed. A cleanup that
 *    never settles holds the run open: there is no cleanup timeout yet.
 *
 * Cancellation (the run's `signal`, or `failFast`) aborts every body's
 * `r.signal`. A job runs after a cancel only if its `runIf` holds with
 * `cancelled: true` (`always()`, `cancelled()`, `failure()` when a need is
 * unhealthy, or a hand-written one), and then `r.signal` is already
 * aborted. A guard or `runIf` that throws is a bug: like a throwing
 * `onEvent`, it cancels the run, and `runJobs` rejects with it once every
 * job has settled.
 *
 * This overload is for roots whose metadata type accepts `undefined`, as
 * with a factory that ignores its parameter (`defineJobs(() => ({}))`):
 * `meta` may be omitted, and every plan, `runIf`, context factory and body
 * then reads `undefined`. Otherwise `meta` is required (the next overload).
 *
 * @template J The roots
 * @param options The roots, and how to watch and stop the run
 * @returns The report, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { always, defineJobs, runJobs } from "@sekhmet/job";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs(() => ({}));
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
 * const cleanup = job({
 * 	name: "cleanup",
 * 	plan: (p) => ({ test: p.needs(test) }),
 * 	runIf: always(),
 * 	run: (_r, { test }) => test.isBlocked(),
 * });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: { test, cleanup } }),
 * );
 * assertEquals(report.passed, false);
 * assert(report.outcomes.test.isBlocked());
 * assertEquals(report.outcomes.cleanup.value().unwrap(), true);
 * ```
 */
export function runJobs<J extends Roots<undefined>>(
	options: OptionalMetaRunOptions<J>,
): Promise<Result<RunReport<J>, GraphError>>;
/**
 * Runs every job reachable from `jobs`, each identity once however many
 * jobs need it, given the run's metadata `meta`, which every plan, `runIf`,
 * context factory and body reads. How a run proceeds is as the overload
 * without `meta` describes.
 *
 * @template M The run's metadata type
 * @template J The roots
 * @param options The roots, the metadata, and how to watch and stop the run
 * @returns The report, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { defineJobs, runJobs } from "@sekhmet/job";
 * import { assertEquals } from "@std/assert";
 *
 * const { job } = defineJobs((meta: { readonly version: string }) => meta);
 * const tag = job({ name: "tag", run: (r) => `v${r.ctx.version}` });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: { tag }, meta: { version: "1.2.0" } }),
 * );
 * assertEquals(report.outcomes.tag.value().unwrap(), "v1.2.0");
 * ```
 */
export function runJobs<M, J extends Roots<M>>(
	options: RunOptions<M, J>,
): Promise<Result<RunReport<J>, GraphError>>;
export async function runJobs<M, J extends Roots<M>>({
	jobs,
	meta,
	signal,
	failFast = false,
	onEvent: hook = () => {},
}: Omit<RunOptions<M, J>, "meta"> & { readonly meta?: M }): Promise<
	Result<RunReport<J>, GraphError>
> {
	const keys = Object.keys(jobs);
	// An omitted meta is undefined, which the overloads admit only for roots
	// whose metadata accepts it
	const given = unerased<M>(meta);
	const planned = planGraph(
		Object.values(jobs).map((job) => getStructParams(job).bind(given)),
	);
	if (isErr(planned)) return planned;
	const graph = unwrap(planned);

	const cancel = new AbortController();
	let bug: { readonly error: unknown } | undefined;
	let hookBroken = false;
	// A throwing hook, guard or runIf is a bug: wind the run down (every body
	// sees its signal abort), and rethrow once all settled
	const fail = (error: unknown): void => {
		if (bug !== undefined) return;
		bug = { error };
		cancel.abort(error);
	};
	const onEvent = (event: JobEvent): void => {
		if (hookBroken) return;
		try {
			hook(event);
		} catch (error) {
			hookBroken = true;
			fail(error);
		}
	};
	const decide = (test: () => boolean): boolean => {
		try {
			return test();
		} catch (error) {
			fail(error);
			return false;
		}
	};

	const runs = new Map<GraphNode, Promise<JobEnd<unknown>>>();
	const reached = new Map<string, JobEnd<unknown>>();
	const counted: CountedEnd[] = [];

	const forwardAbort = (): void => cancel.abort(signal?.reason);
	if (signal?.aborted) forwardAbort();
	signal?.addEventListener("abort", forwardAbort, { once: true });

	let roots: readonly JobEnd<unknown>[] = [];
	let ended = false;
	try {
		roots = await Promise.all(graph.roots.map(start));
		ended = true;
	} finally {
		// However the run ends, no body outlives it, and the caller's signal
		// is left as it was
		if (!ended) cancel.abort(new Error("runJobs ended abnormally"));
		signal?.removeEventListener("abort", forwardAbort);
	}
	if (bug !== undefined) throw bug.error;

	const outcomes = Object.fromEntries(
		keys.map((key, i) => [key, roots[i]] as const),
	);
	return Ok({
		outcomes: unerased<JobEnds<J>>(outcomes),
		all: reached,
		passed: passed(counted),
	});

	function start(node: GraphNode): Promise<JobEnd<unknown>> {
		const known = runs.get(node);
		if (known !== undefined) return known;

		const outcome = lifecycle(node);
		runs.set(node, outcome);
		return outcome;
	}

	/**
	 * One job's way through a run: settle its needs, test its `runIf`, then
	 * run its body. Waiting for every pulled need first is what puts each
	 * job's terminal event after theirs.
	 */
	async function lifecycle({
		job,
		plan,
		needs,
	}: GraphNode): Promise<JobEnd<unknown>> {
		const settled = new Map<AnyNeed, JobEnd<unknown>>();
		const pull = async ({ need, node }: NodeNeed): Promise<void> => {
			settled.set(need, await start(node));
		};

		await Promise.all(needs.filter((need) => !isGuarded(need)).map(pull));
		const cancelledBeforeGuards = cancel.signal.aborted;
		// A guard's view answers only its declared reads, which the graph
		// checked are unconditional needs of this plan, settled by now
		const viewFor = (guard: Guard): EndView => {
			return {
				cancelled: cancelledBeforeGuards,
				outcome: (read) => {
					const { id, name } = getStructParams(read).job;
					const declared = guard.reads.some((known) => {
						return sameJob({ a: getStructParams(known).job.id, b: id });
					});
					const settledRead = needs.find(({ need, node }) => {
						return (
							!isGuarded({ need, node }) && sameJob({ a: node.job.id, b: id })
						);
					});
					const outcome =
						settledRead === undefined
							? undefined
							: settled.get(settledRead.need);
					if (!declared || outcome === undefined) {
						return panic<UndeclaredGuardReadCause>({
							name: "UndeclaredGuardRead",
							message: `a guard of job "${job.name}" (${guard.describe}) read "${name}", which it didn't declare in its reads`,
							cause: { job: job.name, guard: guard.describe, read: name },
						});
					}
					return unerased(outcome);
				},
			};
		};
		await Promise.all(
			needs.filter(isGuarded).map(async (need) => {
				const guard = getStructParams(need.need).guard;
				if (guard === undefined) return;
				if (decide(() => guard.test(viewFor(guard)))) await pull(need);
			}),
		);

		// In plan order: a record would put integer-like job names first
		const pulled = needs.flatMap(({ need, node }) => {
			const outcome = settled.get(need);
			return outcome === undefined ? [] : [{ name: node.job.name, outcome }];
		});
		const outcomes: NeedEnds = Object.fromEntries(
			pulled.map(({ name, outcome }) => [name, outcome]),
		);
		const cancelled = cancel.signal.aborted;
		if (job.runIf.kind === "success") {
			const forced = unmet(pulled);
			if (forced !== undefined) {
				return finish({ job, outcome: JobEnd.fromMini(forced) });
			}
			if (cancelled) return finish({ job, outcome: Cancelled() });
		} else {
			const runs = decide(() => {
				return job.shouldRun({
					cancelled,
					outcomes,
					needs: resolveNeeds({ value: plan, resolve: (n) => settled.get(n) }),
				});
			});
			if (!runs) {
				const outcome = bug === undefined ? Skipped() : Cancelled();
				return finish({ job, outcome });
			}
		}

		const resolved = resolveNeeds({
			value: plan,
			resolve: (need) => {
				const outcome = settled.get(need);
				if (outcome === undefined || job.runIf.kind === "any") return outcome;
				return union(outcome);
			},
		});
		onEvent(new JobEvent("Started", { job: job.name }));
		return finish({ job, outcome: await body({ job, needs: resolved }) });
	}

	async function body({
		job,
		needs,
	}: {
		readonly job: BoundJob<unknown>;
		readonly needs: unknown;
	}): Promise<JobEnd<unknown>> {
		const { name } = job;
		const { cleanup, dispose } = cleanupStack();
		let running = true;
		const step = async <U>({
			name: step,
			run: work,
		}: StepDefinition<U>): Promise<U> => {
			if (!running) {
				panic<JobMisuseCause>({
					name: "StepAfterFinish",
					message: `r.step({ name: "${step}" }) was called after job "${name}" finished`,
					cause: { job: name },
				});
			}
			onEvent(new JobEvent("StepStarted", { job: name, step }));
			try {
				const value = await work();
				onEvent(new JobEvent("StepSucceeded", { job: name, step }));
				return value;
			} catch (error) {
				onEvent(new JobEvent("StepFailed", { job: name, step, error }));
				throw error;
			}
		};

		const ran = await attempt(() => {
			return job.run({ needs, signal: cancel.signal, step, cleanup });
		});
		running = false;
		if (ran.ok) {
			const thrown = await dispose(undefined);
			if (thrown === undefined) return Succeeded(ran.value);
			return Failed(thrown.error);
		}
		const thrown = (await dispose(ran)) ?? ran;
		if (
			thrown === ran &&
			isAbort({ error: ran.error, signal: cancel.signal })
		) {
			return Cancelled();
		}
		return Failed(thrown.error);
	}

	function finish({
		job,
		outcome,
	}: {
		readonly job: BoundJob<unknown>;
		readonly outcome: JobEnd<unknown>;
	}): JobEnd<unknown> {
		const { name, continueOnError } = job;
		reached.set(name, outcome);
		counted.push({ outcome, continueOnError });
		onEvent(terminalEvent({ job: name, outcome }));
		if (failFast && outcome.isFailed() && !continueOnError) {
			cancel.abort(new Error(`failFast: job "${name}" failed`));
		}
		return outcome;
	}
}

/** How a body settled: what it returned, or what it threw. */
type Attempt<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: unknown };

/** Runs `work`, keeping a throw or rejection as a value. */
async function attempt<T>(work: () => Promise<T>): Promise<Attempt<T>> {
	try {
		return { ok: true, value: await work() };
	} catch (error) {
		return { ok: false, error };
	}
}

/** Whether a need came from `needsIf`. */
function isGuarded({ need }: NodeNeed): boolean {
	return getStructParams(need).guard !== undefined;
}

/**
 * Whether a body's `error` is the run's abort itself, so its job ends
 * `Cancelled`: `signal` is aborted and `error` is its `reason`, or an
 * `AbortError` (what `fetch` and friends reject with). Any other error, even
 * one thrown after the abort, is a real failure.
 */
function isAbort({
	error,
	signal,
}: {
	readonly error: unknown;
	readonly signal: AbortSignal;
}): boolean {
	if (!signal.aborted) return false;
	if (error === signal.reason) return true;
	return error instanceof DOMException && error.name === "AbortError";
}

function terminalEvent({
	job,
	outcome,
}: {
	readonly job: string;
	readonly outcome: JobEnd<unknown>;
}): JobEvent {
	if (outcome.isSkipped()) return new JobEvent("Skipped", { job });
	if (outcome.isCancelled()) return new JobEvent("Cancelled", { job });
	if (outcome.isBlocked()) {
		return new JobEvent("Blocked", { job, blockedBy: union(outcome) });
	}
	return new JobEvent("Finished", { job, outcome });
}
