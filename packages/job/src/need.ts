/**
 * What a plan declares: {@linkcode Need}s on other jobs, made with the
 * {@linkcode Planner} `p`, in plain arrays and records. A plan is the job's
 * dependency list.
 *
 * @module
 */

import { Struct } from "@sekhmet/primordials/struct";
import type { BoundJob, Job } from "@/src/job.ts";
import type { JobOutcome } from "@/src/outcome/main/mod.ts";

/**
 * What a plan returns: the job's dependency list, a plain record of needs.
 * Needs may sit in plain arrays and records nested in it, at any depth, and
 * `undefined` stands for one left out.
 *
 * Plain leaf values (a string, a flag) type-check too, but they are a
 * second-class escape hatch, never necessary: a plan sees only the context
 * and closures, and `run` has both. See {@linkcode Field} for the hatch's
 * papercut.
 */
export type PlanRecord = { readonly [key: string]: unknown };

/**
 * A declared dependency on a job that returns `T`, made by `p.needs(job)`
 * or `p.needsIf({ job, when })`. Put it anywhere in the plan's plain arrays
 * and records, and `run` receives the job's value (or outcome) in its
 * place.
 *
 * @template T What the needed job returns
 * @template Conditional `true` for `needsIf`, whose value may be absent
 *   because its guard was false
 */
export class Need<out T, out Conditional extends boolean> extends Struct<
	NeedParams<T, Conditional>
> {}

/**
 * What a {@linkcode Need} holds.
 *
 * @template T What the needed job returns
 * @template Conditional `true` for `needsIf`
 */
export interface NeedParams<T, Conditional extends boolean> {
	/** The needed job, bound to the run's context */
	readonly job: BoundJob<T>;
	/** The guard that pulls the job in, for `needsIf` */
	readonly guard: Guard | undefined;
	/** Whether the need came from `needsIf` */
	readonly conditional: Conditional;
}

/**
 * Any need, whatever its job returns.
 */
export type AnyNeed = Need<unknown, boolean>;

/**
 * What a plan receives as `p`: the run's context, and the two ways to
 * declare a need. A plan is pure and synchronous: it only builds the job's
 * dependency list.
 *
 * @template C The run's context type
 */
export interface Planner<C> {
	/** The run's context, so a plan can decide from config which jobs it needs */
	readonly context: C;
	/**
	 * Declares that the job needs `job`. Under the default `runIf`,
	 * `success()`, the job is `Blocked` if `job` fails or is blocked.
	 */
	needs<T>(job: Job<T, C>): Need<T, false>;
	/**
	 * Declares that the job needs `job` only if `when` holds once the plan's
	 * unconditional needs have settled. A guard reads only those: they
	 * settle first, then every guard is tested, so the need a guard reads
	 * must itself sit in the plan, unconditionally (one that doesn't reads as
	 * absent, and the built-in guards are then false). A need pulled in this way
	 * counts like any other (a failure blocks, under `success()`); one left
	 * out is `undefined` where it sits in the plan.
	 */
	needsIf<T>(options: NeedsIfOptions<T, C>): Need<T, true>;
}

/**
 * What `p.needsIf` takes.
 *
 * @template T What the needed job returns
 * @template C The run's context type
 */
export interface NeedsIfOptions<T, C> {
	/** The job to pull in */
	readonly job: Job<T, C>;
	/** When to pull it in, tested once the unconditional needs settle */
	readonly when: Guard;
}

/**
 * What a guard can read once the plan's unconditional needs settle.
 */
export interface OutcomeView {
	/** Whether the run has been cancelled */
	readonly cancelled: boolean;
	/**
	 * A need's outcome, or `undefined` if it isn't one of the plan's
	 * unconditional needs: a guard can read neither a conditional need nor
	 * one left out of the plan
	 */
	outcome<T>(need: Need<T, boolean>): JobOutcome<Readonly<T>> | undefined;
}

/**
 * The condition on a conditional need: data the runner tests once the needs
 * it reads have settled. Make one with `succeeded`, `failed` or
 * `succeededWith`. `describe` is what a dry run shows.
 */
export interface Guard {
	/** What the guard checks, for a dry run (`build succeeded`) */
	readonly describe: string;
	/** Whether to pull the need in */
	readonly test: (view: OutcomeView) => boolean;
}

/**
 * Which value `run` receives for each need:
 * - `"success"`: `run` is reached only when every need succeeded, so it
 *   gets their values;
 * - `"any"`: `run` may be reached whatever the needs' outcomes, so it gets
 *   their `JobOutcome`s.
 */
export type ConditionKind = "success" | "any";

/**
 * One plan field as `run` receives it. A need resolves (to its value under
 * `"success"`, its outcome under `"any"`, or `undefined` for a `needsIf`
 * left out) wherever it sits in arrays and objects. At run time only plain
 * arrays and plain objects are walked; anything else passes through
 * untouched.
 *
 * Leaf values are the plan's second-class escape hatch (see
 * {@linkcode PlanRecord}). Functions and `Struct`-based values (an
 * `Option`, a `Job`) keep their types, but any other class instance is
 * typed structurally, as a mapped copy of its public members, so its
 * `#private` members are lost and it no longer fits its own class. That
 * papercut is accepted: `run` can read such a value from its context or a
 * closure instead.
 *
 * @template F The field's type in the plan
 * @template K How needs resolve
 */
export type Field<F, K extends ConditionKind> =
	F extends Need<infer T, infer O>
		?
				| (K extends "success" ? Readonly<T> : JobOutcome<Readonly<T>>)
				| (O extends true ? undefined : never)
		: F extends (...args: never) => unknown
			? F
			: F extends readonly unknown[]
				? { readonly [I in keyof F]: Field<F[I], K> }
				: F extends Struct<unknown>
					? F
					: F extends object
						? { readonly [Key in keyof F]: Field<F[Key], K> }
						: F;

/**
 * The plan as `run` receives it: each need resolved per `K`, wherever it
 * sits.
 *
 * @template P The plan's value
 * @template K How needs resolve
 */
export type Resolved<P, K extends ConditionKind> = {
	readonly [Key in keyof P]: Field<P[Key], K>;
};
