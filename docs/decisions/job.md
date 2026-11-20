# Job design

> The decision record for `@sekhmet/job`, kept as project history. The user
> docs are the package's [README](../../packages/job/README.md) and its
> [`docs/`](../../packages/job/docs/) pages, and the API reference is on
> [JSR](https://jsr.io/@sekhmet/job/doc).

Status: **Accepted** (2026-11-19). [PR #67](https://github.com/ben-laird/sekhmet/pull/67)
implements decisions 12–15 and releases the package to JSR as `0.1.0` once it
merges (2026-11-19). Until then the package was an unpublished prototype
(`"publish": false`). [#57](https://github.com/ben-laird/sekhmet/issues/57)
stays the tracker; this file is the source of truth for the decisions.

`@sekhmet/job` runs named jobs as a dependency graph, in the style of GitHub
Actions and other CI runners. It is meant for CLIs, scripts and checks,
starting with Sekhmet's own `deno task ci`.

The decisions are numbered in the order they were made. Later ones refine or
replace earlier ones; where they do, the earlier text stays, marked
_superseded_ with a link to its successor.

## Decisions (owner, 2026-11-18)

### 1. The CI-runner model

A job is a named, observable unit of work, and jobs form a dependency graph
through `needs`. Turning one large function into small interleaving steps is
ruled out: `@sekhmet/effect`'s fibers and scheduler already do that.

### 2. Built on the language's own async primitives

- A job body is any `async` function. Cancellation is an `AbortSignal`, so it
  reaches `fetch`, Deno and Node APIs, and libraries.
- Cancellation is cooperative: a promise can't be cancelled, so a body has to
  observe its signal.
- Job doesn't depend on `@sekhmet/effect`. An optional bridge,
  `@sekhmet/job/effect`, can accept an effect as a body later, the same way
  `@sekhmet/property/schema` does. It isn't built.

### 3. Dogfooding

`scripts/ci`'s step graph (`graph.ts`, `step.ts`, `workflow.ts`, `types.ts`)
is both prior art and the first consumer. Once job can express it, the CI
runner moves onto job. The port hasn't happened yet;
`packages/job/src/ci-slice.test.ts` and `pipelines.test.ts` express a slice of
it.

### 4. Once per run, as CI runners do

Each run of the graph shares one cache, so a job runs once however many jobs
need it, at any depth, and every dependent gets the same result. A job value
can be run again in a separate, independent run.

- This matches GitHub Actions and GitLab CI, which run each job once per
  workflow run or pipeline.
- Reusing results _across_ runs stays opt-in and keyed, never implicit, as
  with `actions/cache`, "re-run failed jobs" and Turborepo/Nx input hashing.
  That's [open question 4](#open-questions).

[Decision 13](#13-typed-results-families-and-front-ends) adds identity by
`(family, key)`, so jobs made on the fly dedupe too.

### 5. Failure follows `scripts/ci`'s statuses, but conditions are code

- `run` is called only when every handle the plan declared has resolved. A
  failed or blocked need makes the job `Blocked`, which is decided before its
  run starts.
- _Superseded by
  [decision 12](#12-runif-replaces-observer-and-plans-become-pure)
  (2026-11-19):_ `scripts/ci`'s conditions become ordinary code in the plan:
  - `always`: the plan asks for `p.outcome(job)`, which never blocks.
  - `failure`, or a predicate: the plan checks the outcome and returns
    `skip()`.

  Conditions are now a `runIf` value on the job, and `p.outcome` and `skip()`
  are gone.
- `continueOnError` stays an option on the job. It affects the run's verdict,
  not the graph.
- Unrelated siblings keep running.
- A run-level `failFast` option aborts the rest through their signals.

### 6. Watching a run is an event hook

A run takes an `onEvent` callback that receives a discriminated union
(`Started`, `Finished` with its status, `Skipped`, `Blocked`, `Cancelled`),
shaped like `@sekhmet/panic`'s hook. There are no global listeners.

As built, `JobEvent` also has `StepStarted`, `StepSucceeded` and `StepFailed`,
for `t.step` ([decision 11](#11-prototype-review-decisions)).

### 7. Every job has a separate plan and run, and the plan is data (2026-11-18)

- `plan(p)` decides what the job needs and returns a plain value: handles from
  `p.needs(job)` plus any data it worked out, or `skip()`.
  - _Superseded by
    [decision 12](#12-runif-replaces-observer-and-plans-become-pure)
    (2026-11-19):_ `skip()` is gone; whether a job runs is its `runIf`.
  - _Refined by [decision 14](#14-plans-are-dependency-lists) (2026-11-19):_
    a plan is the job's dependency list, and "any data it worked out" is a
    second-class escape hatch.
- `run(t, plan)` receives that value with its top-level handles already
  resolved (`Handle<T> | undefined` arrives as `T | undefined`). Since
  [decision 13](#13-typed-results-families-and-front-ends), needs resolve at
  any depth in plain arrays and records.
- The two stay separate on purpose:
  - the plan _describes_ the work, and `run` _interprets_ it;
  - a dry run can print each plan;
  - each half can be tested on its own;
  - `run` can't reach `p`;
  - a plan that is data can be hashed into a cache key later.
- The cost is returning plan-time data explicitly instead of capturing it,
  which is also a feature: everything that crosses from plan to run is
  visible in one value.
- Rejected along the way:
  - **`needs` awaited inside the run** (`Deno.test` style): the graph is
    unknown before the run, `Blocked` needs a thrown marker, and cycles show
    up only at run time.
  - **Fully static `needs`** (Zig style): needs can't depend on another job's
    result.
  - **A plan that returns its run function:** the closure captures `p`, and
    plan-time data stays hidden in it.

### 8. Plans are staged

_Superseded by
[decision 12](#12-runif-replaces-observer-and-plans-become-pure)
(2026-11-19):_ plans are pure and synchronous, and no longer await results.

- A plan may `await p.result(job)` when a result changes what it needs, as
  with Ninja's `dyndep`. `p.needs` is the default, because it doesn't delay
  planning.
- The runner calls every plan first. Plans that await nothing settle at once,
  which gives the static graph and a dry run. Plans that await a result are
  reported as pending on that job.
- Cycles are caught at planning time, across both `needs` and plan awaits.

### 9. Data crosses jobs only through return values

- An upstream `run` returns a value, and a downstream plan declares
  `p.needs(upstream)`. That's the only channel, so every data flow is an edge
  visible in a plan.
- The resolved value is typed `Readonly`, because every dependent shares one
  object per run.
- Files cross as returned paths, like GitHub Actions artifacts; the runner
  copies nothing.
- Jobs can't stream to each other while both are running, and GitHub Actions
  can't either. Progress reaches a CLI through `onEvent` and `t.step`.

### 10. One read-only, typed context per run

_Superseded by
[decision 15](#15-a-context-factory-and-cleanup-with-three-owned-lifetimes)
(2026-11-19):_ `defineJobs((meta, { job, cleanup }) => ctx)` replaces
`defineJobs<C>()`, `runJobs`/`planJobs` take `meta` in place of `context`,
and each job builds its own context just before its run.

Provisional: the owner will confirm once the prototype exists.
`defineJobs<C>()` fixes `C`, and `runJobs({ context })` supplies it. It's for
a logger and config, not for passing data between jobs.

### 11. Prototype review decisions

Owner, 2026-11-18.

- **API-docs lint:** follow schema's precedent. Hand-written variant unions
  replace `Split`, and allowlist rows `until: "#11"` cover the unavoidable
  `Enum`/`Result`/`Struct` references. No re-exporting enum or primordials
  internals.
- **Cleanup survives cancellation, and observers are declared.**
  _Superseded by
  [decision 12](#12-runif-replaces-observer-and-plans-become-pure)
  (2026-11-19):_ a job's `runIf` decides whether it survives a cancel, and
  `observer` is gone.
  - An `always()`/`failure()`-style job is created with its own constructor
    (e.g. `observer({ name, plan, run })`). Its planner has only `context` and
    `outcome`, so the types guarantee it can't depend on anything that blocks.
    Under `failFast` or the run's signal, an observer always runs, with
    `t.signal` already aborted; ordinary jobs are cancelled.
  - Rejected: inferring observers from what a plan awaits first. Behaviour
    that depends on timing is the subtle kind of state the owner wants to
    avoid.
- **An error after an abort is `Failed`** unless it is the abort itself (the
  signal's reason, or an `AbortError`), so a second real bug isn't hidden.
- **`p.result` never leaves a plan suspended.** _Superseded by
  [decision 12](#12-runif-replaces-observer-and-plans-become-pure)
  (2026-11-19):_ `p.result` is gone. It resolved to a `Result`: `Ok` with the
  value, or `Err` with the job's non-success outcome, and a plan that
  returned the `Err` made its job `Blocked`. The noisier code was preferred
  over a hidden, never-returning state.
- **`t.step({ name, run })`** takes one object, following the named-arguments
  rule.
- **Accepted** (the owner will confirm once seen running): a skipped need
  makes its dependent `Skipped`, a cancelled need makes it `Cancelled`
  (precedence: `Blocked` > `Cancelled` > `Skipped`), and `continueOnError`
  exempts a job from `failFast`. Under
  [decision 13](#13-typed-results-families-and-front-ends) this is exactly
  what `all` gives.

## Decisions (owner, 2026-11-19)

### 12. `runIf` replaces `observer`, and plans become pure

This supersedes the observer and staged-plan parts of decisions
[8](#8-plans-are-staged) and [11](#11-prototype-review-decisions). It was
sketched in the playground first, then implemented on `feat/job` (#67).

- **One constructor.** `runIf` is a value on the job: `success()` (the
  default), `failure()`, `cancelled()`, `always()`, or a hand-written
  `({ context, cancelled, needs }) => boolean`. It is evaluated once the
  plan's needs settle. A job survives cancellation exactly when its `runIf`
  holds for a cancelled run, as in GitHub Actions; there is no timing
  inference.
- **`plan(p)` is pure and synchronous.** It only declares the graph:
  `p.needs(job)`, plus `p.needsIf({ job, when })` for a dependency that
  depends on an earlier outcome. `p.result`, `p.outcome` and `skip()` go;
  conditions live in `runIf`. A dry run therefore shows the whole graph,
  guards included.
- **Guards are self-describing values** (`succeeded`, `failed`,
  `succeededWith({ need, where, describe })`), so the dry run can print them.
  The owner accepts the extra noise.
- **`run` is typed by the condition:** under `success()` it gets the needs'
  values; under any other condition it gets their `JobOutcome`s.
- **A false `runIf`:** the default `success()` reports `Blocked` (or
  `Cancelled`/`Skipped`, following the need), and any other condition
  reports `Skipped`. To be confirmed by dogfooding.
- **A guarded need that's pulled in and fails blocks its dependent**, as in
  GitHub Actions.
  - _Note (2026-11-19):_ the comparison is loose. What matches GitHub Actions
    is the blocking: a failed need blocks a `success()` job. GitHub Actions
    has no conditional needs, so `needsIf` itself has no counterpart, as the
    [concepts page](../../packages/job/docs/concepts.md#the-github-actions-mapping)
    says.
- **Use cases for our own pipelines** (worked in
  `packages/job/src/pipelines.test.ts`): the `deno task ci` graph; release as
  one graph generated from the workspace's imports; and compat's runtime list
  kept once in TypeScript and fed to both workflows as a dynamic matrix.
  GitHub Actions keeps triggers, VMs and permissions; the graph owns what
  runs.

### 13. Typed results, families and front ends

Sketched in the playground first, then implemented on `feat/job` (#67).

- **`JobOutcome` gets methods** through the repo's main/mini split
  (`gen:main`), mirroring `Result`'s names (_renamed `JobEnd`, at
  `@sekhmet/job/end`, by
  [decision 16](#16-joboutcome-is-renamed-jobend); the text below keeps the
  old name_):
  - variant predicates (`isSucceeded`, `isSucceededAnd`, `isFailed`, …), all
    type guards shaped like `Result`'s `isOk`;
  - two complement pairs, so `!a.isX()` always means the opposite:
    `isPassing` (Succeeded, Skipped) / `isFailing` (Failed, Blocked,
    Cancelled), and `isHealthy` (Succeeded, Skipped, Cancelled) /
    `isUnhealthy` (Failed, Blocked). Cancelled is healthy but failing;
  - `value()`, `error()`, `blockedBy()` as `Option`s; `map`;
    `toResult(): Result<T, JobOutcome<never>>`;
    `catchFailure(): JobOutcome<Result<T, unknown>>` with `Failed` eliminated
    from the type;
  - `all(record)`, a function: every success gives the values keyed the
    same, else unhealthy (`Blocked`, naming the keys) beats `Cancelled` beats
    `Skipped`. The default `runIf` is built on it;
  - **no `match` method or function**: matching is the one place code uses
    enum's root `match(outcome)({ … })`;
  - constructors take the success type, `Skipped<number>()`, as enum's
    `None<T>()` does.
- **Roots are a record, and the report mirrors it**, as `Promise.all` mirrors
  its input: `runJobs({ jobs: { gate, cleanup } })` gives
  `report.outcomes.gate: JobOutcome<T>`. Every job reached stays in an
  untyped `report.all` for renderers. Record only, no tuple form.
- **Jobs made on the fly are first-class.** A keyed `family({ key, define })`
  gives the same job for the same key, so the runner dedupes by
  `(family, key)` with no cache. It covers recursion (a package's publish
  needs its dependencies') and the matrix
  ([open question 1](#open-questions)).
- **Needs nested in plain arrays and records resolve in place, at any
  depth.** This is provisional: the owner will judge it in practice.
- **Front ends only consume events.** The core emits plain-data events and a
  typed report, and knows nothing of argv, stdout, `Deno` or the DOM. A
  terminal front end takes an injected `write`, and an existing CLI wires
  argv to roots itself. A web UI folds the events with a pure reducer.
  Execution strategies (sequential, one VM per job) are out of scope. No
  front end is built yet.
- **Events stay an enum** (`JobEvent`), with no methods for now. Crossing a
  wire (to a web front end) waits on #48, which serializes all enums; job
  adds no `toJSON`/`fromJSON` of its own.

### 14. Plans are dependency lists

Prototype review decisions, made on `feat/job-runif`; the work landed on
`feat/job` (#67).

- **A plan declares the job's dependencies:** needs in plain arrays and
  records, plus `undefined` for a need left out. Since plans see only the
  context and closures, which `run` already has, a plan can't compute
  anything `run` couldn't. Plain leaf values still type-check but are a
  documented, second-class escape hatch. Its papercuts are accepted: a
  non-`Struct` class instance is typed structurally and loses `#private`.
  There is no wrap API.
- **A guard may read only needs in its own plan, and reading one that isn't
  there is a graph error** before anything runs, as GitHub Actions' `if:`
  sees only `needs:`. This replaces a silent false. Rejected: guards pulling
  in what they read, which adds an implicit kind of edge and raises whether a
  guard-only read should block the job.
  - As built, a guard declares what it reads (`reads`), and each read must be
    an _unconditional_ need of the same plan: reading another `needsIf` is
    the same error (`UndeclaredGuardRead`). A hand-written guard whose `test`
    asks for anything outside its `reads` panics.
- **A plan that throws is a panic,** raised before anything runs, since the
  runner plans the whole graph first. Duplicate names, colliding `family`
  keys (`DuplicateKey`) and cycles (including through `needsIf`) are graph
  errors in the same pass.
- **`JobPlan` is removed.** `planJobs` is synchronous and returns the graph
  as data.

### 15. A context factory, and cleanup with three owned lifetimes

Owner, 2026-11-19; implemented on `feat/job-context-cleanup`, for `feat/job`
(#67). This supersedes [decision 10](#10-one-read-only-typed-context-per-run).

- **`defineJobs((meta, { job, cleanup }) => ctx)`** replaces the type
  argument. TypeScript infers the metadata type from the parameter's
  annotation and the context type from the return, so it reads as plain JS.
  `runJobs` and `planJobs` take `meta` in place of `context`. The factory is
  synchronous for now.
- **`ctx` is built once per job, lazily, just before its `run`,** so one job
  can't pollute another's context. A dry run never calls the factory, and a
  job that never starts (blocked, skipped, or cancelled before it starts)
  never builds one.
- **Plans get `p.meta` only** (no `p.ctx`), so the factory may do real work,
  like opening a db connection, without breaking pure plans. `run` gets
  `r.meta`, `r.ctx`, `r.cleanup`, `r.signal` and `r.step`, and a
  hand-written `runIf` gets `{ meta, cancelled, needs }`.
- **The factory gets the job's name,** so a per-job logger prefix comes
  free.
- **Three lifetimes, each with one owner:**
  - `meta` is the caller's: shared resources (a pool) are disposed by the
    caller, e.g. `await using` around `runJobs`;
  - each job has a cleanup stack, given to the factory and to `run` as
    `r.cleanup`;
  - steps get none for now.
- **Disposal:**
  - LIFO, so the factory's resources go last;
  - always runs once `run` settles: succeeded, failed or cancelled, with
    `r.signal` possibly already aborted;
  - finishes before the job's terminal event and before its outcome reaches
    a dependent, and `runJobs` resolves only once every stack is disposed;
  - if the factory throws, what it already registered is disposed, and the
    job is `Failed`.
- **A job's return value must not hold its own resources,** since dependents
  receive it after disposal. Data crosses as data
  ([decision 9](#9-data-crosses-jobs-only-through-return-values)).
- **`Cleanup` is job's own narrow interface** (`defer`, `use`, `adopt`), with
  `AsyncDisposableStack`'s names, meaning and positional parameters. The
  runner owns disposal, so there's no `disposeAsync` in job code. It's not
  the native stack because Safari/WebKit lacks it and our compat suite runs
  there; it reads `Symbol.asyncDispose`/`Symbol.dispose` only where the
  runtime defines them, with no polyfill. Registering once disposal has
  started is a misuse and panics. It can be swapped for the native one, or
  moved to #68, later.
- **A cleanup that throws makes the job `Failed`.** If the body also threw,
  both errors are kept with `SuppressedError` semantics (`error` is the
  cleanup's, `suppressed` the earlier one), and several cleanup errors chain
  the same way. The global `SuppressedError` is used where it exists, and a
  local error of the same shape (`name: "SuppressedError"`, `error`,
  `suppressed`) elsewhere, with no global polyfill. The verdict and
  `continueOnError` apply as for any `Failed`; a cancelled body whose
  cleanup throws is `Failed` too.
- **As built:**
  - `meta` is required, as `context` was. A factory that takes no parameter
    infers `unknown` metadata, so `defineJobs(() => ({}))` with
    `meta: null` is the shape of a graph that needs none.
  - **Update, 2026-11-19 (0.2.0, #57):** `meta` is optional in `runJobs`
    and `planJobs` when every root's metadata type accepts `undefined`, so
    `defineJobs(() => ({}))` runs with `runJobs({ jobs })`, and an omitted
    `meta` reaches plans, the factory and `run` as `undefined`. It's an
    overload, so `meta: null` still compiles and `M` is still inferred
    `unknown`; a metadata type that rejects `undefined` keeps it required.
  - The factory runs inside the job's body, after its `Started` event, so a
    factory throw reports `Started`, then `Finished` with `Failed`.
  - Misuse panics are `CleanupAfterDispose` and `NotDisposable` (`use` with
    a value that has neither dispose method), with a `CleanupMisuseCause`.
- **Open:** a cleanup that hangs has no timeout yet
  ([open question 2](#open-questions)); async factories; step-level cleanup;
  whether the factory should see the run's signal.

## Decisions (owner, 2026-11-20)

### 16. `JobOutcome` is renamed `JobEnd`

Owner, 2026-11-20 ([#87](https://github.com/ben-laird/sekhmet/issues/87)).
Earlier decisions keep the old name as history.

- **"Outcome" now names `@sekhmet/panic`'s three-channel `Outcome<T, E, P>`**
  (#86), what a panic boundary such as `catchUnwind` returns. Job's
  five-variant enum says how a job finished, so it takes the `-End` names
  lifetime already uses (`SetupEnd`).
- **The rename, as a clean break** (job is pre-1.0, so no aliases):
  `JobOutcome` → `JobEnd`, `JobOutcomeVariants` → `JobEndVariants`, and the
  feature `@sekhmet/job/outcome` (its `mini` barrel and single-module paths
  included) → `@sekhmet/job/end`. The variants, their constructors and the
  methods are unchanged.
- **Out of scope:** changing the variants, such as whether `Failed` should
  become a `Panicked` built on `Outcome`. Job never consumes a panic
  boundary's result, so nothing in it moves to `Outcome`.

## What sets job apart from effect

|             | effect                                 | job                                                                             |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Unit        | a computation (a value you compose)    | a named, observable step of work                                                |
| Composition | `map`, `andThen`, fibers               | a dependency graph through `needs`                                              |
| Concerns    | typed errors, cancellation, scheduling | which jobs ran or were skipped, retries, concurrency limits, progress for a CLI |
| User writes | effect combinators                     | any `async` function                                                            |

Retries and concurrency limits are planned, not built
([open question 2](#open-questions)).

## The first prototype's shape

> **Historical snapshot (2026-11-18).** This is the API of the first
> prototype on `feat/job`, before decision 12. `observer`, staged plans
> (`p.result`, `p.outcome`), `skip()`, array roots, `JobPlan`, and
> `defineJobs<C>()` with `context` (decision 15) are gone. The
> current API is in the [user docs](../../packages/job/README.md).

```ts ignore
const { job } = defineJobs<{
	readonly logger: Logger;
	readonly release: boolean;
}>();

const build = job({
	name: "build",
	plan: (p) => ({ version: p.needs(versionJob) }),
	run: async (t, { version }) => {
		await t.step({
			name: "compile",
			run: async () => {
				/* … */
			},
		}); // reported like Deno.test's t.step
		return { outDir: "dist", version }; // what downstream jobs receive
	},
});

const publish = job({
	name: "publish",
	plan: async (p) => {
		const versioned = await p.result(versionJob); // staged: Result<Readonly<T>, UnmetNeed>
		if (isErr(versioned)) {
			return versioned; // give up: the job ends Blocked by versionJob
		}
		const version = unwrap(versioned);
		return {
			version,
			build: p.needs(build),
			sign: version.startsWith("0.") ? undefined : p.needs(signJob),
		};
	},
	run: async (t, { version, build, sign }) => {
		// handles arrive resolved and Readonly
		if (sign) {
			/* … */
		}
		t.context.logger.info(`publishing ${version} from ${build.outDir}`);
	},
});

// failure()-style observer: declared, so it survives failFast and cancellation
const notify = observer({
	name: "notify",
	plan: async (p) => {
		return isolate(await p.outcome(build), "Failed") ? {} : skip();
	},
	run: async (t) => {
		/* t.signal may already be aborted */
	},
});

const report = await runJobs({
	jobs: [publish, notify], // the roots; everything they need runs once
	context: { logger: console, release: true },
	signal, // optional; cancels the whole run
	failFast: false,
	onEvent: (event) => render(event),
}); // Result<RunReport, GraphError>: a duplicate name or a cycle is an Err, never a throw

const graph = await planJobs({ jobs: [publish, notify], context }); // dry run: plans only
```

Notes on that shape, as recorded then:

- **`p.result` counts as a need once awaited.** If the job didn't succeed,
  the dependent ends `Blocked` (or `Skipped`/`Cancelled`) even if the plan
  carries on, and returning the `Err` is the explicit way out. To _react_ to a
  failure, use `p.outcome`, which never blocks. _Superseded by
  [decision 12](#12-runif-replaces-observer-and-plans-become-pure)._
- **Plans are plain records with string keys,** checked at compile time and
  guarded at run time. Still true: a plan that isn't a plain object panics
  (`NonPlainPlan`), which only an untyped caller can reach.
- **A job is a value, not a name.** The name is for display and reports, and
  it must be unique within a run. Still true; since
  [decision 13](#13-typed-results-families-and-front-ends), identity is
  `(family, key)`.
- **Outcomes are values.** Errors are values in this repo, and a `throw`
  means a panic. The run report gives each job a `JobOutcome`: `Succeeded`,
  with its value; `Failed`, carrying what was thrown or rejected; `Skipped`;
  `Blocked`, naming the jobs that blocked it; `Cancelled`. A throw inside a
  body is caught and becomes `Failed`. It is never rethrown.
- **Structs, not classes.** `Job` is a `Struct` (`@sekhmet/primordials`),
  there's no module-level state, and each run is independent.
- **Type inference:** `run`'s second parameter should be inferred from
  `plan`'s return. TypeScript has inferred left to right within an object
  literal since 4.7. The prototype confirms it.

## Open questions

1. ~~**Matrix.**~~ Answered by
   [decision 13](#13-typed-results-families-and-front-ends): a matrix is a
   `family` over its cases (`RUNTIMES.map(suite)`), with no dedicated API.
2. **Limits.** A concurrency limit, per-job timeouts (`scripts/ci`'s
   `StepTimeout`), retries, and a timeout on a job's cleanup
   ([decision 15](#15-a-context-factory-and-cleanup-with-three-owned-lifetimes)).
3. ~~**Plans as try blocks.**~~ Moot since
   [decision 12](#12-runif-replaces-observer-and-plans-become-pure), since
   plans no longer await results. Kept for the record: once `@sekhmet/block`
   (#66) ships, plans could be `async` try blocks, and
   `yield* tried(await p.result(job))` would stand in for the explicit
   `if (isErr(v)) { return v; }`.
4. **Reusing results across runs.** An opt-in cache keyed by the job's
   inputs, like Turborepo or `actions/cache`. Later, if ever.
5. **Generating workflow YAML from a graph.** The built-in `runIf` conditions
   map one-to-one onto GitHub Actions' `if:` and a pure plan's needs onto
   `needs:`, so a graph using only built-ins could be emitted as a workflow
   file (checked like `gen:main`). Custom conditions and values crossing VMs
   don't map. Later, if ever.

Still open from #67 as well: front ends (terminal and web) that consume
events, and porting `scripts/ci` onto job ([decision 3](#3-dogfooding)).

## Prior art

- **Branch `@sekhmet/job`** (2 commits, March 2026, 297 behind main): a
  sketch in `packages/job/mod.test.ts`, with `JobEnv<M>`, `job(name, fn)`,
  `ctx.needs`, `ctx.signal`, `ctx.meta`, and `run()` returning
  `{ promise, abort }`. Its `mod.ts` and README were still the untouched
  template.
  - The detached `const job = env.job` loses `this`, so `this.#meta` throws.
    This comes from reading the code; it hasn't been run.
  - The cache is per level, so a job needed at different depths runs twice.
  - A failure doesn't abort its siblings.

  The package started fresh off main rather than rebasing that branch.
- **`scripts/ci`:** the command-based step graph described in
  [decision 3](#3-dogfooding).
- **GitHub Actions:** `needs`, `if:` conditions, `continue-on-error`,
  `strategy.matrix`, `fail-fast` and `timeout-minutes`.
