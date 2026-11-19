/**
 * Defining jobs: {@linkcode defineJobs} fixes a run's context type and
 * returns `job`, which pairs a plan (what the job needs, as data) with a run
 * (the work, given that data resolved).
 *
 * @module
 */

import { Result } from "@sekhmet/enum/result/mini";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { panic } from "@sekhmet/panic/mini/core";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import type { JobOutcome } from "@/src/outcome.ts";

/**
 * A named unit of work in a job graph: a plan that declares what it needs,
 * and a run that does the work. A job is a value, not a name; its name is for
 * display and must be unique within a run. Make one with `defineJobs().job`.
 *
 * @template T What the run returns, which dependents receive
 * @template C The run's context type
 */
export class Job<out T, in C> extends Struct<JobParams<T, C>> {}

/**
 * Any job, whatever it returns or reads from the context.
 */
export type AnyJob = Job<unknown, never>;

/**
 * What a {@linkcode Job} holds. The plan's own type is erased here: the
 * stage it returns closes over the plan value and the typed run.
 *
 * @template T What the run returns
 * @template C The run's context type
 */
export interface JobParams<T, C> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/** Whether a failure leaves the run's verdict passing */
	readonly continueOnError: boolean;
	/**
	 * Whether the job was defined with `observer`: it survives the run's
	 * cancellation, running with `t.signal` already aborted
	 */
	readonly observer: boolean;
	/** Calls the user's plan and pairs its value with the typed run */
	readonly plan: (p: Planner<C>) => Promise<Stage<T, C>>;
}

/**
 * Where a job stands once its plan settles: skipped, or planned with a run
 * that takes the plan's handles resolved.
 *
 * @template T What the run returns
 * @template C The run's context type
 */
export type Stage<T, C> =
	| { readonly kind: "skip" }
	| { readonly kind: "unmet" }
	| {
			readonly kind: "planned";
			/** The plan's value as returned, handles unresolved (for a dry run) */
			readonly plan: object;
			/** Runs the body with the plan's top-level handles resolved by `read` */
			readonly run: (t: JobRun<C>, read: HandleReader) => Promise<T>;
	  };

/**
 * Reads the value a settled, succeeded handle resolved to.
 */
export type HandleReader = <U>(handle: Handle<U>) => Readonly<U>;

/**
 * A declared need: the value `p.needs(job)` returns. Put it at the top level
 * of the plan's value, and the run receives the job's result in its place.
 *
 * @template T What the needed job returns
 */
export class Handle<out T> extends Struct<HandleParams<T>> {}

/**
 * What a {@linkcode Handle} holds.
 *
 * @template T What the needed job returns
 */
export interface HandleParams<T> {
	/** The needed job; the run looks its outcome up when resolving */
	readonly job: Job<T, never>;
}

/**
 * The marker a plan returns to skip its job.
 */
export class Skip extends Struct<null> {}

/**
 * Skips the job: return it from a plan instead of the plan's value. The job
 * ends `Skipped`, as do the jobs that need it.
 *
 * @returns The skip marker
 */
export function skip(): Skip {
	return new Skip(null);
}

/**
 * What a plan receives as `p`: the run's context, and the three ways to
 * depend on another job. Each adds an edge to the graph, and a cycle among
 * them is a `GraphError`. Using `p` after the plan settles panics.
 *
 * @template C The run's context type
 */
export interface Planner<C> {
	/** The run's context, so a plan can decide from config */
	readonly context: C;
	/**
	 * Declares that the run needs `job`'s result, without waiting for it. The
	 * job is `Blocked` if `job` fails or is blocked.
	 */
	needs<T>(job: Job<T, C>): Handle<T>;
	/**
	 * Waits for `job`'s result, for a plan whose needs depend on it (a staged
	 * plan): `Ok` with its value, or `Err` with its outcome if it didn't
	 * succeed. Either way the plan resumes. `job` then counts as a need: if it
	 * didn't succeed, the job ends as a `needs` on it would (`Blocked`,
	 * `Skipped` or `Cancelled`) before its run. To give up early, return the
	 * `Err` from the plan.
	 */
	result<T>(job: Job<T, C>): Promise<NeedResult<T>>;
	/**
	 * Waits for `job`'s outcome, whatever it is. It never blocks, so a plan
	 * can run after a failure (`always`) or only after one (`failure`). A
	 * `job` that uses it is still cancelled with the run; define an
	 * `observer` for one that must survive cancellation.
	 */
	outcome<T>(job: Job<T, C>): Promise<JobOutcome<Readonly<T>>>;
}

/**
 * Why `p.result(job)` has no value: `job` ended without succeeding.
 */
export interface UnmetNeed {
	/** The job awaited */
	readonly job: string;
	/** How it ended: anything but `Succeeded` */
	readonly outcome: JobOutcome<unknown>;
}

/**
 * What `p.result(job)` resolves to: the job's value, or why there is none.
 *
 * @template T What the awaited job returns
 */
export type NeedResult<T> = Result<Readonly<T>, UnmetNeed>;

/**
 * What a plan may return instead of a plan record: `skip()`, or the `Err` of
 * a `p.result` it gives up on. Only the `Err` side: returning a `NeedResult`
 * that may be `Ok` is a type error, since an `Ok` is not a plan.
 */
export type PlanExit = Skip | NeedResult<never>;

/**
 * What a run receives as `t`.
 *
 * @template C The run's context type
 */
export interface JobRun<C> {
	/** The run's read-only context, such as a logger and config */
	readonly context: C;
	/**
	 * Aborted when the run is cancelled; pass it to `fetch` and friends. An
	 * observer (defined with `observer`) can start with it already aborted.
	 * If the body then throws, the job ends `Cancelled`
	 * only when the throw is the abort itself (this signal's `reason`, or an
	 * `AbortError`); any other error is `Failed`.
	 */
	readonly signal: AbortSignal;
	/**
	 * Runs a named sub-step, reported through `StepStarted`, then
	 * `StepSucceeded` or `StepFailed`. A step's throw is reported, then
	 * rethrown into the body.
	 */
	step<U>(step: StepDefinition<U>): Promise<U>;
}

/**
 * A sub-step of a job's run, for `t.step`.
 *
 * @template U What the step returns
 */
export interface StepDefinition<U> {
	/** The step's display name, reported in its events */
	readonly name: string;
	/** Does the step's work */
	readonly run: () => U | Promise<U>;
}

/**
 * The plan's value as the run receives it: each top-level handle resolved to
 * the needed job's result, typed `Readonly` since every dependent shares it.
 * `Handle<T> | undefined` becomes `Readonly<T> | undefined`.
 *
 * @template P The plan's value
 */
export type Resolved<P> = { readonly [K in keyof P]: ResolvedField<P[K]> };

/**
 * One field of {@linkcode Resolved}, distributed over a union.
 *
 * @template F The field's type in the plan
 */
export type ResolvedField<F> = F extends Handle<infer U> ? Readonly<U> : F;

/**
 * What a plan returns, unless it exits: a plain object literal with string
 * keys. Arrays, `Map`s, class instances and interface-typed values are
 * rejected, since only an object literal's own string keys are resolved.
 * To name a plan's shape, declare it with `type`, not `interface`: only a
 * type alias gets the implicit index signature this needs. (TypeScript's
 * error then says the type "does not satisfy the constraint `PlanRecord`".)
 */
export type PlanRecord = { readonly [key: string]: unknown };

/**
 * Rejects a plan with symbol keys, which `PlanRecord`'s string index
 * signature lets through: `unknown` when every key is a string, else a type
 * that makes the definition's `plan` fail to type-check.
 *
 * @template P The plan's value, or a `PlanExit`
 */
export type StringKeysOnly<P> = [Exclude<P, PlanExit>] extends [never]
	? unknown
	: [Extract<keyof Exclude<P, PlanExit>, symbol>] extends [never]
		? unknown
		: { readonly plan: "a plan's keys must be strings" };

/**
 * A job with a plan.
 *
 * @template C The run's context type
 * @template P The plan's value, or a `PlanExit`
 * @template T What the run returns
 */
export interface PlannedJobDefinition<C, P extends PlanRecord | PlanExit, T> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/**
	 * Declares what the job needs, as data; may be async, may `skip()`, may
	 * return the `Err` of a `p.result` to give up
	 */
	readonly plan: (p: Planner<C>) => P | Promise<P>;
	/** Does the work, given the plan with its handles resolved */
	readonly run: (
		t: JobRun<C>,
		plan: Resolved<Exclude<P, PlanExit>>,
	) => T | Promise<T>;
	/** A failure leaves the run's verdict passing (default `false`) */
	readonly continueOnError?: boolean | undefined;
}

/**
 * A job that needs nothing: the degenerate plan, which returns `{}`.
 *
 * @template C The run's context type
 * @template T What the run returns
 */
export interface LeafJobDefinition<C, T> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/** Does the work */
	readonly run: (t: JobRun<C>) => T | Promise<T>;
	/** A failure leaves the run's verdict passing (default `false`) */
	readonly continueOnError?: boolean | undefined;
}

/**
 * What an observer's plan receives as `p`: the run's context and
 * `outcome`, and no way to depend on a job that blocks (no `needs`, no
 * `result`).
 *
 * @template C The run's context type
 */
export interface ObserverPlanner<C> {
	/** The run's context, so a plan can decide from config */
	readonly context: C;
	/** Waits for `job`'s outcome, whatever it is; it never blocks */
	outcome<T>(job: Job<T, C>): Promise<JobOutcome<Readonly<T>>>;
}

/**
 * An observer: a job that watches other jobs' outcomes, as GitHub Actions'
 * `always()` and `failure()` jobs do. Its plan returns plain data (no
 * handles) or `skip()`.
 *
 * @template C The run's context type
 * @template P The plan's data
 * @template T What the run returns
 */
export interface ObserverDefinition<C, P extends PlanRecord, T> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/** Observes outcomes and decides, as data; may be async, may `skip()` */
	readonly plan: (p: ObserverPlanner<C>) => P | Skip | Promise<P | Skip>;
	/** Does the work, given the plan's data */
	readonly run: (t: JobRun<C>, plan: Readonly<P>) => T | Promise<T>;
	/** A failure leaves the run's verdict passing (default `false`) */
	readonly continueOnError?: boolean | undefined;
}

/**
 * The cause of a panic for an observer's plan that asked for `needs` or
 * `result`, which only an untyped caller can do.
 */
export interface ObserverDependencyCause {
	/** The observer */
	readonly job: string;
	/** The method it called */
	readonly method: "needs" | "result";
}

/**
 * What {@linkcode defineJobs} returns.
 *
 * @template C The run's context type
 */
export interface JobKit<C> {
	/**
	 * Defines a job. `run`'s second parameter is inferred from what `plan`
	 * returns; a job that needs nothing omits `plan`.
	 */
	readonly job: {
		<P extends PlanRecord | PlanExit, T = void>(
			definition: PlannedJobDefinition<C, P, T> & StringKeysOnly<P>,
		): Job<T, C>;
		<T = void>(definition: LeafJobDefinition<C, T>): Job<T, C>;
	};
	/**
	 * Defines an observer: a job whose plan can only observe other jobs'
	 * outcomes, so it never depends on anything that blocks. Unlike every
	 * `job`, an observer is not cancelled with the run (by its `signal`,
	 * `failFast` or a graph error): it runs with `t.signal` already aborted,
	 * so it can tell. Use it for `always()` cleanups and `failure()`
	 * notifiers.
	 */
	readonly observer: <P extends PlanRecord, T = void>(
		definition: ObserverDefinition<C, P, T> & StringKeysOnly<P>,
	) => Job<T, C>;
}

/**
 * Fixes the context type `C` of the runs these jobs take part in, and
 * returns `job` to define them with.
 *
 * @returns The job constructor for context `C`
 *
 * @example
 * ```ts
 * import { defineJobs, runJobs } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assert } from "@std/assert";
 *
 * const { job } = defineJobs<{ readonly greeting: string }>();
 *
 * const name = job({ name: "name", run: () => "world" });
 * const greet = job({
 * 	name: "greet",
 * 	plan: (p) => ({ who: p.needs(name) }),
 * 	run: (t, { who }) => `${t.context.greeting}, ${who}`,
 * });
 *
 * const report = unwrap(
 * 	await runJobs({ jobs: [greet], context: { greeting: "hello" } }),
 * );
 * assert(report.passed);
 * ```
 */
export function defineJobs<C>(): JobKit<C> {
	return { job: defineJob, observer: observerJob };

	function defineJob<P extends PlanRecord | PlanExit, T>(
		definition: PlannedJobDefinition<C, P, T> | LeafJobDefinition<C, T>,
	): Job<T, C> {
		if ("plan" in definition) return plannedJob(definition);
		return plannedJob<C, Record<never, never>, T>({
			name: definition.name,
			continueOnError: definition.continueOnError,
			plan: () => ({}),
			run: (t) => definition.run(t),
		});
	}
}

function plannedJob<C, P extends PlanRecord | PlanExit, T>({
	name,
	plan,
	run,
	continueOnError = false,
}: PlannedJobDefinition<C, P, T>): Job<T, C> {
	return new Job<T, C>({
		name,
		continueOnError,
		observer: false,
		plan: async (p) => {
			const value = await plan(p);
			if (value instanceof Skip) return { kind: "skip" };
			if (value instanceof Result && isErr(value)) return { kind: "unmet" };
			assertPlainPlan({ job: name, plan: value });
			return {
				kind: "planned",
				plan: value,
				run: async (t, read) => {
					return await run(t, resolvePlanUnsafely({ plan: value, read }));
				},
			};
		},
	});
}

function observerJob<C, P extends PlanRecord, T>({
	name,
	plan,
	run,
	continueOnError = false,
}: ObserverDefinition<C, P, T>): Job<T, C> {
	return new Job<T, C>({
		name,
		continueOnError,
		observer: true,
		plan: async (p) => {
			const value = await plan(observing({ job: name, planner: p }));
			if (value instanceof Skip) return { kind: "skip" };
			assertPlainPlan({ job: name, plan: value });
			return {
				kind: "planned",
				plan: value,
				run: async (t) => await run(t, value),
			};
		},
	});
}

/**
 * Narrows a runner's `p` to what an observer may use. Its `needs` and
 * `result` stay present only to panic, for untyped callers.
 */
function observing<C>({
	job,
	planner,
}: {
	job: string;
	planner: Planner<C>;
}): ObserverPlanner<C> {
	const refuse = (method: ObserverDependencyCause["method"]) => {
		return (): never => {
			return panic<ObserverDependencyCause>({
				name: "ObserverDependency",
				message: `observer "${job}" called p.${method}(); an observer can only await p.outcome`,
				cause: { job, method },
			});
		};
	};
	const narrowed = {
		context: planner.context,
		outcome: planner.outcome,
		needs: refuse("needs"),
		result: refuse("result"),
	};
	return narrowed;
}

/**
 * The cause of a panic for a plan that isn't a plain object with string keys,
 * which only untyped (JavaScript) callers can return.
 */
export interface NonPlainPlanCause {
	/** The job whose plan returned it */
	readonly job: string;
	/** What it returned */
	readonly plan: unknown;
}

/**
 * Panics unless `plan` is a plain object (its prototype is `Object.prototype`
 * or `null`) with no symbol keys, the shape `PlanRecord` and
 * `StringKeysOnly` demand of typed callers.
 */
function assertPlainPlan({ job, plan }: { job: string; plan: object }): void {
	const prototype = Object.getPrototypeOf(plan);
	const plain = prototype === Object.prototype || prototype === null;
	if (plain && Object.getOwnPropertySymbols(plan).length === 0) return;
	panic<NonPlainPlanCause>({
		name: "NonPlainPlan",
		message: `the plan of job "${job}" must return a plain object with string keys, or skip()`,
		cause: { job, plan },
	});
}

/**
 * Replaces each top-level handle in `plan` with its resolved value.
 *
 * A cast (one of three in the package, with `recallUnsafely` and
 * `valueOfUnsafely` in run.ts): an object built key by key can't be
 * typed as a mapped type over a generic `P`. The caller has ruled out a
 * `PlanExit` and checked that `plan` is a plain object with only string keys, so
 * `Object.entries` visits exactly the keys `Resolved<P>` maps.
 */
function resolvePlanUnsafely<P extends PlanRecord | PlanExit>({
	plan,
	read,
}: {
	plan: P;
	read: HandleReader;
}): Resolved<Exclude<P, PlanExit>> {
	const resolved = Object.fromEntries(
		Object.entries(plan).map(([key, field]) => {
			return [key, field instanceof Handle ? read(field) : field];
		}),
	);
	return resolved as Resolved<Exclude<P, PlanExit>>;
}

/**
 * A job's display name.
 *
 * @param job The job
 * @returns Its name
 */
export function nameOf(job: AnyJob): string {
	return getStructParams(job).name;
}
