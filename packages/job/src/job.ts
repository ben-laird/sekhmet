/**
 * Defining jobs: {@linkcode defineJobs} fixes a run's context type and
 * returns `job`, which pairs a pure plan (the job's dependency list) with a
 * run (the work, given that list resolved), and `family`, which makes jobs
 * on the fly.
 *
 * @module
 */

import { block } from "@sekhmet/primordials/scoping";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { type Condition, type NeedOutcomes, success } from "@/src/condition.ts";
import { unerased } from "@/src/erasure.ts";
import {
	type ConditionKind,
	Need,
	type Planner,
	type PlanRecord,
	type Resolved,
} from "@/src/need.ts";

/**
 * A job's identity: its family and its key within it. The runner runs each
 * identity once, however many plans need it. A plain `job` is a family of
 * one, with the key `""`; `family` gives the same identity for the same key.
 */
export interface JobId {
	/** The family, unique to each `job` or `family` call */
	readonly family: symbol;
	/** The key within the family */
	readonly key: string;
}

/**
 * A named unit of work in a job graph: a plan that declares what it needs,
 * and a run that does the work. A job is a value; its identity is its
 * {@linkcode JobId}, and its name is for display, unique within a run.
 * Make one with `defineJobs().job` or `defineJobs().family`.
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
 * What a {@linkcode Job} holds.
 *
 * @template T What the run returns
 * @template C The run's context type
 */
export interface JobParams<T, C> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/** The job's identity */
	readonly id: JobId;
	/** Binds the job to a run's context, erasing the plan's type */
	readonly bind: (context: C) => BoundJob<T>;
}

/**
 * A job bound to a run's context, as the runner sees it: the plan's type is
 * erased, and `run` resolves needs from what the runner hands it.
 *
 * @template T What the run returns
 */
export interface BoundJob<T> {
	/** The job's display name */
	readonly name: string;
	/** The job's identity */
	readonly id: JobId;
	/** Whether a failure leaves the run's verdict passing */
	readonly continueOnError: boolean;
	/** The job's `runIf`: what `run` receives, and what a dry run shows */
	readonly runIf: {
		readonly kind: ConditionKind;
		readonly describe: string;
	};
	/** Calls the plan: pure and synchronous */
	readonly plan: () => PlanRecord;
	/** Tests the `runIf`, given the settled needs */
	readonly shouldRun: (input: ShouldRunInput) => boolean;
	/** Runs the body, given the plan with its needs resolved */
	readonly run: (input: BodyInput) => Promise<T>;
}

/**
 * What a bound job's `runIf` is tested with.
 */
export interface ShouldRunInput {
	/** Whether the run has been cancelled */
	readonly cancelled: boolean;
	/** The plan, each need replaced by its outcome (or `undefined`) */
	readonly needs: unknown;
	/** The settled needs' outcomes, by job name */
	readonly outcomes: NeedOutcomes;
}

/**
 * What a bound job's body is run with.
 */
export interface BodyInput {
	/** The plan, each need resolved per the job's `runIf` */
	readonly needs: unknown;
	/** The run's signal */
	readonly signal: AbortSignal;
	/** Runs a named sub-step */
	readonly step: <U>(step: StepDefinition<U>) => Promise<U>;
}

/**
 * What a run receives as `t`.
 *
 * @template C The run's context type
 */
export interface JobRun<C> {
	/** The run's read-only context, such as a logger and config */
	readonly context: C;
	/**
	 * Aborted when the run is cancelled; pass it to `fetch` and friends. A
	 * job that runs after a cancel (its `runIf` held with `cancelled: true`)
	 * starts with it already aborted. If the body then throws, the job ends
	 * `Cancelled` only when the throw is the abort itself (this signal's
	 * `reason`, or an `AbortError`); any other error is `Failed`.
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
 * What a hand-written `runIf` receives.
 *
 * @template C The run's context type
 * @template P The plan's value
 */
export interface RunIfInput<C, P> {
	/** The run's context */
	readonly context: C;
	/** Whether the run has been cancelled */
	readonly cancelled: boolean;
	/** The plan, each need replaced by its outcome */
	readonly needs: Resolved<P, "any">;
}

/**
 * What every job definition has.
 *
 * @template C The run's context type
 * @template P The plan's value
 */
export interface JobDefinitionBase<C, P> {
	/** The job's display name, unique within a run */
	readonly name: string;
	/**
	 * Returns the job's dependency list: needs in plain arrays and records,
	 * pure and synchronous. A job that needs nothing omits it. Anything else
	 * `run` uses comes from its context or a closure (leaf values in a plan
	 * are a second-class escape hatch; see `PlanRecord`). A plan that throws
	 * is a bug: `runJobs` and `planJobs` rethrow it before any job starts.
	 */
	readonly plan?: ((p: Planner<C>) => P) | undefined;
	/**
	 * A failure leaves the run's verdict passing, and doesn't trigger
	 * `failFast` (default `false`)
	 */
	readonly continueOnError?: boolean | undefined;
}

/**
 * A job that runs only when every need succeeded and the run isn't
 * cancelled: the default `runIf`, `success()`. Its `run` gets the needs'
 * values.
 *
 * @template C The run's context type
 * @template P The plan's value
 * @template T What the run returns
 */
export interface SuccessJobDefinition<C, P, T> extends JobDefinitionBase<C, P> {
	/** `success()`, the default */
	readonly runIf?: Condition<"success"> | undefined;
	/** Does the work, given the plan with each need's value in its place */
	readonly run: (t: JobRun<C>, needs: Resolved<P, "success">) => T | Promise<T>;
}

/**
 * A job that may run whatever its needs' outcomes were: its `runIf` is
 * `failure()`, `cancelled()`, `always()`, or a hand-written predicate. Its
 * `run` gets the needs' `JobOutcome`s.
 *
 * @template C The run's context type
 * @template P The plan's value
 * @template T What the run returns
 */
export interface AnyJobDefinition<C, P, T> extends JobDefinitionBase<C, P> {
	/**
	 * When to call `run`, tested once the needs settle. A hand-written one
	 * runs after a cancel whenever it returns `true` for `cancelled: true`.
	 */
	readonly runIf: Condition<"any"> | ((input: RunIfInput<C, P>) => boolean);
	/** Does the work, given the plan with each need's outcome in its place */
	readonly run: (t: JobRun<C>, needs: Resolved<P, "any">) => T | Promise<T>;
}

/**
 * The plan of a job that omits `plan`: it needs nothing.
 */
export type EmptyPlan = Record<never, never>;

/**
 * What {@linkcode defineJobs} returns.
 *
 * @template C The run's context type
 */
export interface JobKit<C> {
	/**
	 * Defines a job. `run`'s second parameter is inferred from what `plan`
	 * returns, resolved per `runIf`.
	 */
	readonly job: {
		<P extends PlanRecord = EmptyPlan, T = void>(
			definition: SuccessJobDefinition<C, P, T>,
		): Job<T, C>;
		<P extends PlanRecord = EmptyPlan, T = void>(
			definition: AnyJobDefinition<C, P, T>,
		): Job<T, C>;
	};
	/**
	 * Makes jobs on the fly: `define` builds the job for an argument, and
	 * `key` names its identity within the family. The same key gives the
	 * same job, however many times it is built, so a family can need itself
	 * (a package's publish needs its dependencies') and cover a matrix.
	 */
	readonly family: <A, T>(
		options: FamilyOptions<A, T, C>,
	) => (arg: A) => Job<T, C>;
}

/**
 * What `family` takes.
 *
 * @template A What each job of the family is built from
 * @template T What its jobs return
 * @template C The run's context type
 */
export interface FamilyOptions<A, T, C> {
	/** The identity of the job for `arg` within the family */
	readonly key: (arg: A) => string;
	/** Builds the job for `arg`; its name must differ per key */
	readonly define: (arg: A) => Job<T, C>;
}

/**
 * The roots of a run or a dry run: jobs by key.
 *
 * @template C The run's context type
 */
export type Roots<C> = { readonly [key: string]: Job<unknown, C> };

/**
 * Fixes the context type `C` of the runs these jobs take part in, and
 * returns `job` and `family` to define them with.
 *
 * @template C The run's context type
 * @returns The job constructors for context `C`
 *
 * @example
 * ```ts
 * import { defineJobs, runJobs } from "@sekhmet/job";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { assertEquals } from "@std/assert";
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
 * 	await runJobs({ jobs: { greet }, context: { greeting: "hello" } }),
 * );
 * assertEquals(report.outcomes.greet.value().unwrap(), "hello, world");
 * ```
 */
export function defineJobs<C>(): JobKit<C> {
	return { job: defineJob, family: defineFamily };

	function defineFamily<A, T>({
		key,
		define,
	}: FamilyOptions<A, T, C>): (arg: A) => Job<T, C> {
		const family = Symbol("family");
		return (arg) => {
			const { name, bind } = getStructParams(define(arg));
			const id: JobId = { family, key: key(arg) };
			return new Job<T, C>({
				name,
				id,
				bind: (context) => ({ ...bind(context), id }),
			});
		};
	}

	function defineJob<P extends PlanRecord, T>(
		definition: SuccessJobDefinition<C, P, T> | AnyJobDefinition<C, P, T>,
	): Job<T, C> {
		const { name, plan, runIf, run, continueOnError = false } = definition;
		const id: JobId = { family: Symbol(name), key: "" };
		const condition = conditionOf(runIf);

		return new Job<T, C>({
			name,
			id,
			bind: (context) => {
				return {
					name,
					id,
					continueOnError,
					runIf: condition,
					plan: () => plan?.(planner(context)) ?? {},
					shouldRun: ({ cancelled, needs, outcomes }) => {
						if (runIf === undefined) {
							return success().test({ cancelled, outcomes });
						}
						if (typeof runIf === "function") {
							return runIf({ context, cancelled, needs: unerased(needs) });
						}
						return runIf.test({ cancelled, outcomes });
					},
					run: async ({ needs, signal, step }) => {
						return await run({ context, signal, step }, unerased(needs));
					},
				};
			},
		});
	}
}

/** What a job's `runIf` makes `run` receive, and how a dry run shows it. */
function conditionOf(
	runIf: Condition<ConditionKind> | ((input: never) => boolean) | undefined,
): BoundJob<unknown>["runIf"] {
	return block(() => {
		if (runIf === undefined) return { kind: "success", describe: "success()" };
		if (typeof runIf === "function") return { kind: "any", describe: "custom" };
		return { kind: runIf.kind, describe: runIf.describe };
	});
}

/** The `p` a plan receives: it binds each needed job to the context. */
function planner<C>(context: C): Planner<C> {
	return {
		context,
		needs: (job) => {
			return new Need({
				job: getStructParams(job).bind(context),
				guard: undefined,
				conditional: false,
			});
		},
		needsIf: ({ job, when }) => {
			return new Need({
				job: getStructParams(job).bind(context),
				guard: when,
				conditional: true,
			});
		},
	};
}
