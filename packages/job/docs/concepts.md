---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/job`, and why a job graph behaves the way it does.
The [recipes](./recipes.md) show how to put them to work, and the
[API reference on JSR](https://jsr.io/@sekhmet/job/doc) documents each
export. The
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/job.md)
keeps the history behind each choice.

## A job is a named step in a graph

`@sekhmet/job` runs named jobs as a dependency graph, the way GitHub Actions
and other CI runners do. It is meant for CLIs, scripts and checks, starting
with Sekhmet's own `deno task ci`. Each job is a unit of work you can watch:
it has a name, it declares the jobs it needs, and it ends with an outcome
the report gives back.

A job's body is any `async` function. Job adds no runtime of its own:
cancellation is an `AbortSignal`, so it reaches `fetch`, Deno and Node APIs
and other libraries unchanged. That makes cancellation cooperative. A
promise can't be stopped from outside, so a body that ignores `r.signal`
runs to the end.

## A plan and a run

Every job is split in two. Its `plan` declares what it needs, and its `run`
does the work, given what those needs returned:

- `plan(p)` is pure and synchronous. It returns the job's dependency list:
  needs made with `p.needs` and `p.needsIf`, in plain records and arrays at
  any depth, with `undefined` for a need left out.
- `run(r, needs)` receives that list with each need resolved in place,
  typed from the plan with no annotations. `r` carries the run's `meta`, the
  job's own `ctx` and `cleanup` stack, its `signal`, and `step` for
  reporting progress.

A job that needs nothing omits `plan`.

The split is what lets the runner know the whole graph before any job
starts. It also keeps each half honest. A plan describes the work and `run`
interprets it, so a dry run can show every plan, each half can be tested
alone, and `run` can't reach `p` to declare a need late.

A plan sees only the run's metadata and whatever its closure captured, and
`run` has both of those too. So a plan can't compute anything `run`
couldn't, and its job is only to say what the job depends on. Plain values
in a plan (a string, a flag) still type-check and pass through untouched,
but they are a second-class escape hatch, never necessary: read config from
`r.meta` in `run` instead. The hatch has an accepted papercut. A class
instance that isn't a `Struct` (your own class, or a `Date`) arrives in
`run` typed structurally, so its `#private` members are lost; a
`Struct`-based value, such as an `Option` or a `Job`, and a function keep
their types.

Data crosses from one job to another only as a return value: an upstream
`run` returns it, and a downstream plan declares `p.needs(upstream)`. Every
data flow is therefore an edge you can see in a plan. The value arrives
`Readonly`, because every dependent shares the one object. Files cross as
returned paths, as GitHub Actions' artifacts do, and the runner copies
nothing.

## Three lifetimes, each with one owner

A job may hold resources while it runs, such as a connection or a lock, and
each resource has exactly one owner, which releases it:

- **The run's `meta` is the caller's.** It lives as long as the caller
  keeps it, typically around one `runJobs` call, and every plan, `runIf`,
  context factory and body reads the same value. A resource the whole run
  shares, such as a connection pool, goes here, and the caller releases it,
  for example with `await using` around `runJobs`.
- **A job's context and its cleanup stack are the runner's.** The context
  factory builds each job's `ctx` just before its `run`, so one job can't
  change another's. A dry run never calls the factory, and neither does a
  job that never starts (blocked, skipped, or cancelled first). Plans and
  `runIf` see only `meta`, which is why the factory may do real work. The
  factory and `run` share one cleanup stack, which the runner disposes in
  reverse order once `run` settles, so the factory's resources go last.
- **Steps have no cleanup of their own** for now; a step registers on its
  job's stack.

Disposal finishes before the job's terminal event, and before any job that
needs it starts, and `runJobs` resolves only once every job is disposed. A
cleanup that throws makes its job `Failed`, keeping a body's earlier error
as `SuppressedError` does; `continueOnError` and the verdict treat it as
any other failure.

Because dependents receive a job's return value after its cleanup has run,
a return value must not hold the job's own resources. Data crosses jobs as
data: a path, a record, a version string.

`Cleanup` is job's own narrow interface, `defer`, `use` and `adopt`, with
`AsyncDisposableStack`'s names and meaning, rather than the native stack,
which Safari and WebKit lack. The runner owns disposal, so job code never
disposes a stack itself. Two limits are open: a cleanup has no timeout yet,
and the factory is synchronous.

## Conditions are data

Whether a job runs, once its needs settle, is its `runIf`. The built-ins are
values, not code paths:

- `success()`, the default: every need succeeded, and the run isn't
  cancelled;
- `failure()`: some need is unhealthy, it failed or was blocked by a
  failure;
- `cancelled()`: the run was cancelled;
- `always()`: whatever happened.

A hand-written `runIf` is a function of `{ meta, cancelled, needs }`.

The condition also types `run`. Under `success()`, `run` is reached only
when every need succeeded, so it gets their values. Under any other
condition it may be reached whatever happened, so it gets each need's
`JobOutcome` and has to look.

The guards on conditional needs are data too. `succeeded(need)`,
`failed(need)` and `succeededWith({ need, where, describe })` each carry a
description and the needs they read, so a dry run can print the whole
graph, guards included, without running anything.

A guard may read only the unconditional needs of its own plan, which settle
before any guard is tested, as GitHub Actions' `if:` sees only a job's
`needs:`. Reading anything else is a graph error before the run starts,
rather than a guard that is silently false. The alternative, letting a
guard pull in whatever it reads, would add a second, hidden kind of edge,
and raise the question of whether a need read only by a guard should block
the job.

### The GitHub Actions mapping

The vocabulary follows GitHub Actions on purpose, so a workflow reads
across:

| GitHub Actions           | `@sekhmet/job`                                       |
| ------------------------ | ---------------------------------------------------- |
| `needs:`                 | `p.needs(job)` in the plan                           |
| `if: success()`, default | `runIf: success()`, the default                      |
| `if: failure()`          | `runIf: failure()`                                   |
| `if: cancelled()`        | `runIf: cancelled()`                                 |
| `if: always()`           | `runIf: always()`                                    |
| an `if:` expression      | a hand-written `runIf`                               |
| `continue-on-error`      | `continueOnError`                                    |
| `strategy.matrix`        | a `family` over the cases                            |
| `strategy.fail-fast`     | `failFast`, for the whole run rather than one matrix |
| a job's outputs          | the needed job's return value                        |
| artifacts                | returned paths                                       |
| `timeout-minutes`        | none yet; timeouts and retries are an open question  |

Two differences are deliberate. A job that a failure stopped from starting
is `Blocked`, naming the needs that stopped it, where GitHub Actions shows
it as skipped. And `p.needsIf` has no direct counterpart: it pulls a job
into the graph only when an earlier outcome calls for it.

## Once per run

Within one run, each job runs once, however many jobs need it and at
whatever depth, and every dependent gets the same result. This is how
GitHub Actions and GitLab CI treat a workflow run or pipeline. A job value
can be run again in a separate run, which shares nothing with the first.
Reusing results across runs, as `actions/cache` or Turborepo's input hashing
do, would be opt-in and keyed, never implicit; it isn't built.

"The same job" means the same identity, not the same name. A job is a
value, and its identity is a `JobId`: its family and a key within it. A
plain `job` is a family of one. `family({ key, define })` makes jobs on the
fly and gives the same identity for the same key, so a graph generated from
data dedupes with no cache: a package's publish job can need its
dependencies' publish jobs, and a dependency several packages share still
publishes once.

The name is for display and reports, and it must be unique within a run.
Two identities that share a name are a `DuplicateName` error. A family key
that builds two differently named jobs is a `DuplicateKey` error, since
otherwise only the first would silently run.

## The outcome algebra

Every job reached ends with exactly one `JobOutcome`:

- `Succeeded`, with what `run` returned;
- `Failed`, with what `run` threw or rejected with;
- `Skipped`: its `runIf` was false, or under the default a need was
  skipped;
- `Blocked`: a need failed or was blocked, so the body never started; it
  names those needs;
- `Cancelled`: the run was cancelled before or while the job ran.

Errors are values in Sekhmet, and a `throw` means a bug. A body's throw is
caught and becomes `Failed`; it is never rethrown.

Two pairs of predicates group the variants, and each pair is a complement,
so `!outcome.isPassing()` always means `outcome.isFailing()`:

| Variant     | `isPassing` / `isFailing` | `isHealthy` / `isUnhealthy` |
| ----------- | ------------------------- | --------------------------- |
| `Succeeded` | passing                   | healthy                     |
| `Skipped`   | passing                   | healthy                     |
| `Cancelled` | failing                   | healthy                     |
| `Failed`    | failing                   | unhealthy                   |
| `Blocked`   | failing                   | unhealthy                   |

The two pairs answer different questions. Passing asks whether the job did
what the run needed: a run passes when every job it reached is passing, or
`Failed` with `continueOnError`. Healthy asks whether something broke. A
cancelled job is the one that tells them apart: nothing in it broke, but
its work didn't get done, so it is healthy yet failing. That is why
`failure()` asks whether a need is unhealthy, so a cancel alone doesn't page
anyone, while a cancelled run still doesn't pass.

`all(record)` folds a record of outcomes into one, as `Promise.all` folds
promises. If every outcome succeeded, it is `Succeeded` with their values,
keyed the same. Otherwise the worst one wins:

1. any unhealthy outcome gives `Blocked`, naming those keys in order;
2. then any `Cancelled` gives `Cancelled`;
3. then any `Skipped` gives `Skipped`.

`all` is the default rule. Under `success()`, a job whose needs didn't all
succeed ends with exactly the outcome `all` gives them, and one whose needs
succeeded in a cancelled run ends `Cancelled`. So a failure blocks what
depends on it, transitively; a skip propagates as a skip, as in GitHub
Actions; and a cancel propagates as a cancel. A hand-written `runIf` rebuilds
the rule with `all(needs).isSucceeded()`.

Outcomes have no `match` method. Matching is the one place outcome code
uses enum's own `match(outcome)({ … })`, so there is one way to match any
enum in the repo. The other methods mirror `Result`'s names: `value()`,
`error()` and `blockedBy()` return `Option`s, and `map`, `toResult` and
`catchFailure` transform the outcome. `@sekhmet/job/outcome` has them as
methods, and `@sekhmet/job/outcome/mini` as tree-shakable functions of the
same names.

## Everything is planned before anything runs

Because plans are pure and synchronous, `runJobs` calls every reachable plan
first, the targets of `needsIf` included, and checks the graph before any
body starts. A `GraphError` comes back as an `Err`, never a throw and never
a hang:

- `DuplicateName`: two identities share a name;
- `DuplicateKey`: a family built two differently named jobs for one key;
- `UndeclaredGuardRead`: a guard reads something other than an
  unconditional need of its own plan;
- `Cycle`: jobs need each other, through `needs` or `needsIf`.

A graph error describes the shape of the jobs you passed in, which is input
a CLI can report and a caller can handle. A bug in code is different, and it
panics:

- a plan that throws is rethrown before anything starts;
- a guard that throws, or asks for a need outside the `reads` it declared,
  cancels the run, and so does a `runIf` or `onEvent` that throws. Every
  body sees its signal abort, and `runJobs` rejects with the error once
  every job has settled;
- calling `r.step` after the body finished panics.

Planning up front is also what makes `planJobs`, the dry run, possible: it
is the same pass, without the bodies. An earlier design let a plan await
another job's result before declaring its needs. It was dropped, because
the graph then wasn't known until the run was under way, and a dry run
couldn't show it.

## Cancellation

A run is cancelled by its `signal`, or by `failFast` when a job fails
without `continueOnError`. Either way, every body's `r.signal` aborts.

A job that hasn't started yet runs only if its `runIf` holds for a
cancelled run. The default `success()` doesn't, so ordinary jobs end
`Cancelled`; `always()`, `cancelled()`, `failure()` with an unhealthy need,
and a hand-written `runIf` that allows it still run, with `r.signal`
already aborted. Whether a job survives a cancel is decided by a value you
can read, not by when it happened to start.

A `runIf` other than `success()` that is false normally makes its job
`Skipped`. Once a bug (a throwing guard, `runIf` or `onEvent`) has wound the
run down, it makes the job `Cancelled` instead.

A body that throws after the abort ends `Cancelled` only if it threw the
abort itself: the signal's `reason`, or an `AbortError` such as `fetch`
rejects with. Any other error is `Failed`, so a real bug hit while winding
down isn't hidden behind the cancel.

## Job and `@sekhmet/effect`

Both packages deal with work that takes time and can be cancelled, but at
different grains, and job doesn't depend on effect:

|             | `@sekhmet/effect`                      | `@sekhmet/job`                                                            |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Unit        | a computation, a value you compose     | a named, observable step of work                                          |
| Composition | `map`, `andThen`, fibers               | a dependency graph through needs                                          |
| Concerns    | typed errors, cancellation, scheduling | which jobs ran, were skipped or blocked; cancellation; progress for a CLI |
| You write   | effect combinators                     | any `async` function                                                      |

Turning one large function into small steps that interleave is effect's
job, through its fibers and scheduler. Job sits a level above: it decides
which pieces of work run, in what order, and reports what happened to each.
Concurrency limits, timeouts and retries belong on job's side too, but they
aren't built yet.

## Where GitHub Actions stays in charge

Job doesn't replace a CI service. GitHub Actions keeps _where and when_:
triggers, virtual machines, permissions, and a matrix that gives each case
its own machine. The job graph owns _what_ runs, in TypeScript, and runs the
same on a laptop as in CI. The intent is for a workflow step to run a
graph, and for a list kept once in TypeScript, such as the runtimes compat
tests on, to feed both the graph and the workflow's matrix.

The core knows nothing of a terminal, a browser or `Deno`. It reports plain
`JobEvent`s to `onEvent` and returns a typed report. A front end, such as a
terminal printer or a web view, consumes those; none ships yet. How jobs are
placed on machines is out of scope.
