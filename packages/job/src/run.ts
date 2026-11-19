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
import type { NeedOutcomes } from "@/src/condition.ts";
import { unerased } from "@/src/erasure.ts";
import { JobEvent } from "@/src/event.ts";
import { type GraphNode, type NodeNeed, planGraph } from "@/src/graph.ts";
import type { GraphError } from "@/src/graph-error.ts";
import type { BoundJob, Job, Roots, StepDefinition } from "@/src/job.ts";
import type { AnyNeed, OutcomeView } from "@/src/need.ts";
import {
	all,
	Cancelled,
	Failed,
	type JobOutcome,
	Skipped,
	Succeeded,
} from "@/src/outcome/main/mod.ts";
import { resolveNeeds } from "@/src/plan-data.ts";
import { type CountedOutcome, passed } from "@/src/verdict.ts";

/**
 * What {@linkcode runJobs} takes.
 *
 * @template C The run's context type
 * @template J The roots
 */
export interface RunOptions<C, J extends Roots<C>> {
	/** The roots, by key; every job they reach runs once */
	readonly jobs: J;
	/** The run's read-only context, shared by every plan and body */
	readonly context: C;
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
 * The roots' outcomes, keyed as the roots were, each typed by its job, as
 * `Promise.all` types its input.
 *
 * @template J The roots
 */
export type Outcomes<J> = {
	readonly [K in keyof J]: J[K] extends Job<infer T, never>
		? JobOutcome<Readonly<T>>
		: never;
};

/**
 * What a run that formed a valid graph reports.
 *
 * @template J The roots
 */
export interface RunReport<J> {
	/** Each root's outcome, under its key, typed */
	readonly outcomes: Outcomes<J>;
	/** Every job the run reached, by name, in the order they settled */
	readonly all: ReadonlyMap<string, JobOutcome<unknown>>;
	/**
	 * Every job reached is passing (`Succeeded` or `Skipped`), or `Failed`
	 * with `continueOnError`
	 */
	readonly passed: boolean;
}

/**
 * The cause of the panic for a `t.step` called after its job finished.
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
 * duplicate name or a cycle is an `Err` before anything starts, and a plan
 * that throws is rethrown before anything starts. Then each job:
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
 * 4. runs its body. A throw or rejection is `Failed`, never rethrown, except
 *    the abort itself after a cancel (the signal's `reason`, or an
 *    `AbortError`), which is `Cancelled`.
 *
 * Cancellation (the run's `signal`, or `failFast`) aborts every body's
 * `t.signal`. A job runs after a cancel only if its `runIf` holds with
 * `cancelled: true` (`always()`, `cancelled()`, `failure()` when a need is
 * unhealthy, or a hand-written one), and then `t.signal` is already
 * aborted. A guard or `runIf` that throws is a bug: like a throwing
 * `onEvent`, it cancels the run, and `runJobs` rejects with it once every
 * job has settled.
 *
 * @template C The run's context type
 * @template J The roots
 * @param options The roots, the context, and how to watch and stop the run
 * @returns The report, or why the jobs don't form a graph
 *
 * @example
 * ```ts
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { always, defineJobs, runJobs } from "@sekhmet/job";
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
 * const cleanup = job({
 * 	name: "cleanup",
 * 	plan: (p) => ({ test: p.needs(test) }),
 * 	runIf: always(),
 * 	run: (_t, { test }) => test.isBlocked(),
 * });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: { test, cleanup }, context: null }),
 * );
 * assertEquals(report.passed, false);
 * assert(report.outcomes.test.isBlocked());
 * assertEquals(report.outcomes.cleanup.value().unwrap(), true);
 * ```
 */
export async function runJobs<C, J extends Roots<C>>({
	jobs,
	context,
	signal,
	failFast = false,
	onEvent: hook = () => {},
}: RunOptions<C, J>): Promise<Result<RunReport<J>, GraphError>> {
	const keys = Object.keys(jobs);
	const planned = planGraph(
		Object.values(jobs).map((job) => getStructParams(job).bind(context)),
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

	const runs = new Map<GraphNode, Promise<JobOutcome<unknown>>>();
	const reached = new Map<string, JobOutcome<unknown>>();
	const counted: CountedOutcome[] = [];

	const forwardAbort = (): void => cancel.abort(signal?.reason);
	if (signal?.aborted) forwardAbort();
	signal?.addEventListener("abort", forwardAbort, { once: true });

	let roots: readonly JobOutcome<unknown>[] = [];
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
		outcomes: unerased<Outcomes<J>>(outcomes),
		all: reached,
		passed: passed(counted),
	});

	function start(node: GraphNode): Promise<JobOutcome<unknown>> {
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
	}: GraphNode): Promise<JobOutcome<unknown>> {
		const settled = new Map<AnyNeed, JobOutcome<unknown>>();
		const pull = async ({ need, node }: NodeNeed): Promise<void> => {
			settled.set(need, await start(node));
		};

		await Promise.all(needs.filter((need) => !isGuarded(need)).map(pull));
		const view: OutcomeView = {
			cancelled: cancel.signal.aborted,
			outcome: (need) => unerased(settled.get(need)),
		};
		await Promise.all(
			needs.filter(isGuarded).map(async (need) => {
				const guard = getStructParams(need.need).guard;
				if (decide(() => guard?.test(view) === true)) await pull(need);
			}),
		);

		const outcomes: NeedOutcomes = Object.fromEntries(
			needs.flatMap(({ need, node }) => {
				const outcome = settled.get(need);
				return outcome === undefined ? [] : [[node.job.name, outcome]];
			}),
		);
		const cancelled = cancel.signal.aborted;
		if (job.runIf.kind === "success") {
			const combined = all(outcomes);
			if (!combined.isSucceeded()) return finish({ job, outcome: combined });
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
	}): Promise<JobOutcome<unknown>> {
		const { name } = job;
		let running = true;
		const step = async <U>({
			name: step,
			run: work,
		}: StepDefinition<U>): Promise<U> => {
			if (!running) {
				panic<JobMisuseCause>({
					name: "StepAfterFinish",
					message: `t.step({ name: "${step}" }) was called after job "${name}" finished`,
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

		try {
			return Succeeded(await job.run({ needs, signal: cancel.signal, step }));
		} catch (error) {
			if (isAbort({ error, signal: cancel.signal })) return Cancelled();
			return Failed(error);
		} finally {
			running = false;
		}
	}

	function finish({
		job,
		outcome,
	}: {
		readonly job: BoundJob<unknown>;
		readonly outcome: JobOutcome<unknown>;
	}): JobOutcome<unknown> {
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
	readonly outcome: JobOutcome<unknown>;
}): JobEvent {
	if (outcome.isSkipped()) return new JobEvent("Skipped", { job });
	if (outcome.isCancelled()) return new JobEvent("Cancelled", { job });
	if (outcome.isBlocked()) {
		return new JobEvent("Blocked", { job, blockedBy: union(outcome) });
	}
	return new JobEvent("Finished", { job, outcome });
}
