/**
 * What a plan declares: {@linkcode Need}s on other jobs, made with the
 * {@linkcode Planner} `p`, in plain arrays and records. A plan is the job's
 * dependency list.
 *
 * @module
 */

import { Struct } from "@sekhmet/primordials/struct";
import type { JobEnd } from "@/src/end/main/mod.ts";
import type { BoundJob, Job } from "@/src/job.ts";

/**
 * What a plan returns: the job's dependency list, a plain record of needs.
 * Needs may sit in plain arrays and records nested in it, at any depth, and
 * `undefined` stands for one left out.
 *
 * Plain leaf values (a string, a flag) type-check too, but they are a
 * second-class escape hatch, never necessary: a plan sees only the metadata
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
	/** The needed job, bound to the run's metadata */
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
 * What a plan receives as `p`: the run's metadata, and the two ways to
 * declare a need. A plan is pure and synchronous: it only builds the job's
 * dependency list. It sees no context: a context is built per job, only
 * once that job starts.
 *
 * @template M The run's metadata type
 */
export interface Planner<M> {
	/** The run's metadata, so a plan can decide from config which jobs it needs */
	readonly meta: M;
	/**
	 * Declares that the job needs `job`. Under the default `runIf`,
	 * `success()`, the job is `Blocked` if `job` fails or is blocked.
	 */
	needs<T>(job: Job<T, M>): Need<T, false>;
	/**
	 * Declares that the job needs `job` only if `when` holds once the plan's
	 * unconditional needs have settled. A guard may read only those, as
	 * GitHub Actions' `if:` sees only `needs:`: every need in its `reads`
	 * must match, by `JobId`, an unconditional need in the same plan, or the
	 * graph is an `UndeclaredGuardRead` error before anything runs. A need
	 * pulled in this way counts like any other (a failure blocks, under
	 * `success()`); one left out is `undefined` where it sits in the plan.
	 */
	needsIf<T>(options: NeedsIfOptions<T, M>): Need<T, true>;
}

/**
 * What `p.needsIf` takes.
 *
 * @template T What the needed job returns
 * @template M The run's metadata type
 */
export interface NeedsIfOptions<T, M> {
	/** The job to pull in */
	readonly job: Job<T, M>;
	/** When to pull it in, tested once the unconditional needs settle */
	readonly when: Guard;
}

/**
 * What a guard can read once the plan's unconditional needs settle: the
 * outcomes of the needs it declared in its `reads`, and nothing else.
 */
export interface OutcomeView {
	/** Whether the run has been cancelled */
	readonly cancelled: boolean;
	/**
	 * The outcome of `need`, which must be one of the guard's `reads`
	 * (matched by `JobId`). Asking for any other need is a bug, so it panics
	 * (`UndeclaredGuardRead`), and the run rejects with that panic once
	 * every job has settled.
	 */
	outcome<T>(need: Need<T, boolean>): JobEnd<Readonly<T>>;
}

/**
 * The condition on a conditional need: data the runner tests once the needs
 * it reads have settled. Make one with `succeeded`, `failed` or
 * `succeededWith`, which fill in `reads`; a hand-written guard declares its
 * own. `describe` is what a dry run shows.
 */
export interface Guard {
	/** What the guard checks, for a dry run (`build succeeded`) */
	readonly describe: string;
	/**
	 * The needs `test` reads. Each must match, by `JobId`, an unconditional
	 * need in the same plan; the graph checks it before anything runs
	 */
	readonly reads: readonly AnyNeed[];
	/** Whether to pull the need in */
	readonly test: (view: OutcomeView) => boolean;
}

/**
 * Which value `run` receives for each need:
 * - `"success"`: `run` is reached only when every need succeeded, so it
 *   gets their values;
 * - `"any"`: `run` may be reached whatever the needs' outcomes, so it gets
 *   their `JobEnd`s.
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
 * papercut is accepted: `run` can read such a value from its metadata or a
 * closure instead.
 *
 * @template F The field's type in the plan
 * @template K How needs resolve
 */
export type Field<F, K extends ConditionKind> =
	F extends Need<infer T, infer O>
		?
				| (K extends "success" ? Readonly<T> : JobEnd<Readonly<T>>)
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
