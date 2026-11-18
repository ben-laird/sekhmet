/**
 * Defining jobs: {@linkcode defineJobs} fixes a run's context type and
 * returns `job`, which pairs a plan (what the job needs, as data) with a run
 * (the work, given that data resolved).
 *
 * @module
 */

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
	/** The needed job */
	readonly job: AnyJob;
	/** The needed job's outcome in this run */
	readonly outcome: Promise<JobOutcome<T>>;
	/** The outcome once it has settled, for the synchronous resolution */
	settled: JobOutcome<T> | undefined;
}

/**
 * Makes a handle on `job`'s `outcome` in one run.
 *
 * @param params.job The needed job
 * @param params.outcome Its outcome in this run
 * @returns The handle
 */
export function handleOn<T>({
	job,
	outcome,
}: {
	job: AnyJob;
	outcome: Promise<JobOutcome<T>>;
}): Handle<T> {
	const params: HandleParams<T> = { job, outcome, settled: undefined };
	void outcome.then((settled) => {
		params.settled = settled;
	});
	return new Handle(params);
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
	 * plan). If `job` doesn't succeed, the plan never resumes: the job ends as
	 * a `needs` on it would.
	 */
	result<T>(job: Job<T, C>): Promise<Readonly<T>>;
	/**
	 * Waits for `job`'s outcome, whatever it is. It never blocks, so a plan
	 * can run after a failure (`always`) or only after one (`failure`).
	 */
	outcome<T>(job: Job<T, C>): Promise<JobOutcome<Readonly<T>>>;
}

/**
 * What a run receives as `t`.
 *
 * @template C The run's context type
 */
export interface JobRun<C> {
	/** The run's read-only context, such as a logger and config */
	readonly context: C;
	/** Aborted when the run is cancelled; pass it to `fetch` and friends */
	readonly signal: AbortSignal;
	/**
	 * Runs a named sub-step, reported through `StepStarted`/`StepFinished`
	 * events. A step's throw is reported, then rethrown into the body.
	 */
	step<U>(name: string, fn: () => U | Promise<U>): Promise<U>;
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
 * What a plan returns, unless it skips: a plain object literal with string
 * keys. Arrays, `Map`s, class instances and interface-typed values are
 * rejected, since only an object literal's own string keys are resolved.
 */
export type PlanRecord = { readonly [key: string]: unknown };

/**
 * Rejects a plan with symbol keys, which `PlanRecord`'s string index
 * signature lets through: `unknown` when every key is a string, else a type
 * that makes the definition's `plan` fail to type-check.
 *
 * @template P The plan's value, or `Skip`
 */
export type StringKeysOnly<P> = [Exclude<P, Skip>] extends [never]
	? unknown
	: [Extract<keyof Exclude<P, Skip>, symbol>] extends [never]
		? unknown
		: { readonly plan: "a plan's keys must be strings" };

/**
 * A job with a plan.
 *
 * @template C The run's context type
 * @template P The plan's value, or `Skip`
 * @template T What the run returns
 */
export interface PlannedJobDefinition<C, P extends PlanRecord | Skip, T> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/** Declares what the job needs, as data; may be async, may `skip()` */
	readonly plan: (p: Planner<C>) => P | Promise<P>;
	/** Does the work, given the plan with its handles resolved */
	readonly run: (
		t: JobRun<C>,
		plan: Resolved<Exclude<P, Skip>>,
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
		<P extends PlanRecord | Skip, T = void>(
			definition: PlannedJobDefinition<C, P, T> & StringKeysOnly<P>,
		): Job<T, C>;
		<T = void>(definition: LeafJobDefinition<C, T>): Job<T, C>;
	};
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
	return { job: defineJob };

	function defineJob<P extends PlanRecord | Skip, T>(
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

function plannedJob<C, P extends PlanRecord | Skip, T>({
	name,
	plan,
	run,
	continueOnError = false,
}: PlannedJobDefinition<C, P, T>): Job<T, C> {
	return new Job<T, C>({
		name,
		continueOnError,
		plan: async (p) => {
			const value = await plan(p);
			if (value instanceof Skip) return { kind: "skip" };
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
 * A cast (one of two in the package): an object built key by key can't be
 * typed as a mapped type over a generic `P`. The caller has ruled out `Skip`
 * and checked that `plan` is a plain object with only string keys, so
 * `Object.entries` visits exactly the keys `Resolved<P>` maps.
 */
function resolvePlanUnsafely<P extends PlanRecord | Skip>({
	plan,
	read,
}: {
	plan: P;
	read: HandleReader;
}): Resolved<Exclude<P, Skip>> {
	const resolved = Object.fromEntries(
		Object.entries(plan).map(([key, field]) => {
			return [key, field instanceof Handle ? read(field) : field];
		}),
	);
	return resolved as Resolved<Exclude<P, Skip>>;
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
