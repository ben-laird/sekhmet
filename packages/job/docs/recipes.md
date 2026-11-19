---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when you write a pipeline as jobs. For
every export, see the [API reference](https://jsr.io/@sekhmet/job/doc); for
why job behaves as it does, see the [concepts](./concepts.md).

## How to need a job only when another succeeded

This guide shows you how to pull a job into the graph only when an earlier
outcome calls for it: here, signing a release only when its version is
stable.

1. Declare the need the decision depends on with `p.needs`, and keep it in
   the plan you return.
2. Build a guard on it: `succeeded(need)`, `failed(need)`, or
   `succeededWith({ need, where, describe })` to test the need's value.
3. Declare the conditional need with `p.needsIf({ job, when: guard })`. In
   `run`, it is the job's value when the guard held, and `undefined` when it
   didn't.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, runJobs, Succeeded, succeededWith } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs((_meta: { readonly version: string }) => ({}));

const version = job({ name: "version", run: (r) => r.meta.version });
const sign = job({ name: "sign", run: () => "signature" });

const publish = job({
	name: "publish",
	plan: (p) => {
		const v = p.needs(version);
		const stable = succeededWith({
			need: v,
			where: (value) => !value.startsWith("0."),
			describe: "a stable version",
		});
		return { version: v, signature: p.needsIf({ job: sign, when: stable }) };
	},
	run: (_r, { version, signature }) => `${version} ${signature ?? "unsigned"}`,
});

const stable = unwrap(
	await runJobs({ jobs: { publish }, meta: { version: "1.4.0" } }),
);
assertEquals(stable.outcomes.publish, Succeeded("1.4.0 signature"));

const early = unwrap(
	await runJobs({ jobs: { publish }, meta: { version: "0.3.0" } }),
);
assertEquals(early.outcomes.publish, Succeeded("0.3.0 unsigned"));
assertEquals(early.all.has("sign"), false);
```

When the guard is false, `sign` isn't part of the run at all. When it holds,
`sign` counts like any other need: if it fails, `publish` is `Blocked`.

A guard may read only the unconditional needs of its own plan, which settle
before any guard is tested. A need you made with `p.needs` but left out of
the returned plan doesn't count, and neither does another `needsIf`. Reading
one is a graph error, reported before anything runs:

```ts
import { unwrapErr } from "@sekhmet/enum/result/mini";
import {
	defineJobs,
	runJobs,
	succeeded,
	UndeclaredGuardRead,
} from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs(() => ({}));

const version = job({ name: "version", run: () => "1.4.0" });
const sign = job({ name: "sign", run: () => "signature" });

const publish = job({
	name: "publish",
	plan: (p) => {
		const v = p.needs(version);
		// `v` isn't in the returned plan, so the guard can't read it
		return { signature: p.needsIf({ job: sign, when: succeeded(v) }) };
	},
	run: () => {},
});

const result = await runJobs({ jobs: { publish }, meta: null });
assertEquals(
	unwrapErr(result),
	UndeclaredGuardRead({
		job: "publish",
		guard: "version succeeded",
		read: "version",
	}),
);
```

To fix it, return `v` in the plan too, as the first example does.

The built-in guards are enough for most graphs. If you write your own, it is
an object with a `describe` string for dry runs, the `reads` it looks at,
and a `test` that receives a view of those needs' outcomes. Asking the view
for a need outside `reads` panics.

## How to clean up or notify after a failure

This guide shows you how to run a job when something upstream broke, or
whatever happened.

1. For a notifier, set `runIf: failure()`. It runs only when some need is
   unhealthy: `Failed`, or `Blocked` by a failure. Otherwise it is
   `Skipped`.
2. For a cleanup, set `runIf: always()`.
3. In `run`, read each need as a `JobOutcome`: under any `runIf` other than
   the default, `run` gets outcomes, not values.
4. Add `continueOnError: true` to a cleanup whose own failure shouldn't fail
   the run.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, defineJobs, failure, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs((_meta: { readonly log: string[] }) => ({}));

const build = job({
	name: "build",
	run: (): string => {
		throw new Error("compile error");
	},
});

const notify = job({
	name: "notify",
	plan: (p) => ({ build: p.needs(build) }),
	runIf: failure(),
	run: (r, { build }) => {
		const error = build.error().map(String).unwrapOr("blocked");
		r.meta.log.push(`paged: ${error}`);
	},
});

const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ build: p.needs(build) }),
	runIf: always(),
	continueOnError: true,
	run: (r) => r.meta.log.push("removed dist"),
});

const log: string[] = [];
const report = unwrap(
	await runJobs({ jobs: { notify, cleanup }, meta: { log } }),
);

assertEquals(log, ["paged: Error: compile error", "removed dist"]);
assertEquals(report.outcomes.notify, Succeeded(undefined));
```

Both conditions also decide what happens after a cancel. An `always()` job
still runs, with `r.signal` already aborted, so keep a cleanup's work short
or independent of the signal. A `failure()` job runs after a cancel only if
a need is unhealthy.

## How to clean up resources

This guide shows you how to release what a job opens (a lock, a
connection, a temporary directory) however the job ends, and where a
resource the whole run shares belongs.

1. In `run`, register what to release on `r.cleanup`: `defer(fn)` for a
   callback, `use(resource)` for a value with `Symbol.asyncDispose` or
   `Symbol.dispose`, and `adopt(value, fn)` for a value that isn't
   disposable itself. They mean what `AsyncDisposableStack`'s methods of the
   same names mean.
2. For a resource every job's context holds, open it in the context
   factory and register it on the factory's `cleanup`. Each job that starts
   gets its own, and the factory's registrations are released last.
3. Put a resource the whole run shares, such as a pool, in `meta`. It is
   yours, not the runner's: release it around `runJobs`, for example with
   `await using`.
4. Return data, never a resource you registered: dependents receive the
   return value after the job's cleanup has run.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Connection extends Disposable {
	readonly query: (sql: string) => string;
}

interface Pool extends AsyncDisposable {
	readonly connect: (name: string) => Connection;
}

const log: string[] = [];

/** A stand-in for a database pool that logs what happens to it. */
function openPool(): Pool {
	log.push("pool opened");
	return {
		connect: (name) => {
			log.push(`${name} connected`);
			return {
				query: (sql) => `${name} ran ${sql}`,
				[Symbol.dispose]: () => {
					log.push(`${name} disconnected`);
				},
			};
		},
		[Symbol.asyncDispose]: async () => {
			log.push("pool closed");
		},
	};
}

const { job } = defineJobs(
	(meta: { readonly pool: Pool }, { job, cleanup }) => {
		return { db: cleanup.use(meta.pool.connect(job)) };
	},
);

const migrate = job({
	name: "migrate",
	run: (r) => {
		log.push("migrate locked");
		r.cleanup.defer(() => {
			log.push("migrate unlocked");
		});
		return r.ctx.db.query("migrations");
	},
});

{
	await using pool = openPool();
	const report = unwrap(await runJobs({ jobs: { migrate }, meta: { pool } }));
	assertEquals(report.outcomes.migrate, Succeeded("migrate ran migrations"));
}

assertEquals(log, [
	"pool opened",
	"migrate connected",
	"migrate locked",
	"migrate unlocked",
	"migrate disconnected",
	"pool closed",
]);
```

The job's cleanup runs once `run` settles, whether it succeeded, failed or
was cancelled, and it finishes before the job's terminal event and before
any job that needs it starts. A cleanup that throws makes the job `Failed`.
If the body threw as well, the outcome's error is a `SuppressedError` whose
`error` is the cleanup's and whose `suppressed` is the body's, and several
cleanup throws chain the same way. On a runtime without `SuppressedError`,
the error is a plain `Error` of the same shape and name.

There is no timeout on cleanup yet: a cleanup that never settles holds its
job, and the run, open.

## How to write your own `runIf`

This guide shows you how to combine the default rule with a check of your
own: here, a coverage report that runs only when the needs succeeded and
the run's metadata asks for it.

1. Pass `runIf` a function of `{ meta, cancelled, needs }`. `needs` is your
   plan with each need replaced by its `JobOutcome`. There is no context
   yet: a job's context is built only once it is known to run.
2. Rebuild the default rule with `all(needs).isSucceeded()`, and add
   `!cancelled` unless the job should run after a cancel: a hand-written
   `runIf` decides that too.
3. In `run`, read each need as an outcome, as with any `runIf` but the
   default.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { all, defineJobs, runJobs, Skipped, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs((_meta: { readonly reportsCoverage: boolean }) => {
	return {};
});

const test = job({ name: "test", run: () => 0.92 });

const coverage = job({
	name: "coverage",
	plan: (p) => ({ test: p.needs(test) }),
	runIf: ({ meta, cancelled, needs }) => {
		return !cancelled && meta.reportsCoverage && all(needs).isSucceeded();
	},
	run: (_r, { test }) => `${test.value().unwrapOr(0) * 100}%`,
});

const ci = unwrap(
	await runJobs({ jobs: { coverage }, meta: { reportsCoverage: true } }),
);
assertEquals(ci.outcomes.coverage, Succeeded("92%"));

const local = unwrap(
	await runJobs({ jobs: { coverage }, meta: { reportsCoverage: false } }),
);
assertEquals(local.outcomes.coverage, Skipped());
```

A hand-written `runIf` that returns `false` makes the job `Skipped`,
whatever its needs did. Only the default `success()` turns a failed need
into `Blocked`.

## How to generate jobs from data

This guide shows you how to make one job per item, when the items come from
data: one publish job per package, each needing its dependencies' publish
jobs.

1. Call `family({ key, define })`. `define` builds the job for an item, and
   `key` names it. The same key gives the same job, however many times you
   ask, so the run runs it once.
2. Give each job a name that differs per key.
3. When the family needs itself, annotate it with its type. TypeScript can't
   infer a value that refers to itself.
4. Collect the jobs' needs in an array; needs resolve wherever they sit in
   plain arrays and records.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, type Job, planJobs } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Package {
	readonly name: string;
	readonly deps: readonly Package[];
}

const primordials: Package = { name: "primordials", deps: [] };
const enumPkg: Package = { name: "enum", deps: [primordials] };
const panic: Package = { name: "panic", deps: [primordials] };
const schema: Package = { name: "schema", deps: [enumPkg, panic] };

const { job, family } = defineJobs(() => ({}));

const publish: (pkg: Package) => Job<string, unknown> = family({
	key: (pkg: Package) => pkg.name,
	define: (pkg) => {
		return job({
			name: `publish ${pkg.name}`,
			plan: (p) => ({ deps: pkg.deps.map((dep) => p.needs(publish(dep))) }),
			run: () => `${pkg.name}@1.0.0`,
		});
	},
});

const graph = unwrap(
	planJobs({ jobs: { schema: publish(schema) }, meta: null }),
);
assertEquals(
	[...graph.jobs.keys()],
	["publish schema", "publish enum", "publish primordials", "publish panic"],
);
```

`primordials` is needed by both `enum` and `panic`, but the family gives the
same job for its key, so it appears and runs once.

A matrix is the same tool over a list of cases:

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const RUNTIMES = ["node", "bun", "deno"] as const;
type Runtime = (typeof RUNTIMES)[number];

const { job, family } = defineJobs((_meta: { readonly broken: Runtime }) => {
	return {};
});

const suite = family({
	key: (runtime: Runtime) => runtime,
	define: (runtime) => {
		return job({
			name: `test (${runtime})`,
			run: (r) => {
				if (r.meta.broken === runtime) throw new Error("tests failed");
			},
		});
	},
});

const summary = job({
	name: "summary",
	plan: (p) => ({
		results: RUNTIMES.map((runtime) => ({
			runtime,
			outcome: p.needs(suite(runtime)),
		})),
	}),
	runIf: always(),
	run: (_r, { results }) => {
		return results.map(({ runtime, outcome }) => {
			return `${outcome.isSucceeded() ? "pass" : "FAIL"} ${runtime}`;
		});
	},
});

const meta: { readonly broken: Runtime } = { broken: "bun" };
const report = unwrap(await runJobs({ jobs: { summary }, meta }));
assertEquals(
	report.outcomes.summary,
	Succeeded(["pass node", "FAIL bun", "pass deno"]),
);
```

Two keys that build jobs with the same name are a `DuplicateName` error,
and one key that builds two differently named jobs is a `DuplicateKey`
error. Both are reported before anything runs.

## How to preview a run

This guide shows you how to see the whole graph without running a job, for
a `--dry-run` flag or a test of the graph's shape.

1. Call `planJobs({ jobs, meta })` with the roots and metadata you would
   pass to `runJobs`. It calls every plan, and no context factory or `run`.
2. Read `graph.jobs`, a map from each job's name to its `runIf`, its
   `continueOnError`, and its needs. A conditional need carries its guard's
   description in `when`.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, defineJobs, planJobs, succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs(() => ({}));

let ran = false;
const build = job({
	name: "build",
	run: () => {
		ran = true;
		return "dist";
	},
});
const smoke = job({ name: "smoke", run: () => {} });
const deploy = job({
	name: "deploy",
	plan: (p) => {
		const built = p.needs(build);
		return { built, smoke: p.needsIf({ job: smoke, when: succeeded(built) }) };
	},
	run: () => {},
});
const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ deploy: p.needs(deploy) }),
	runIf: always(),
	run: () => {},
});

const graph = unwrap(planJobs({ jobs: { cleanup }, meta: null }));

assertEquals([...graph.jobs.keys()], ["cleanup", "deploy", "build", "smoke"]);
assertEquals(graph.jobs.get("cleanup")?.runIf, "always()");
assertEquals(graph.jobs.get("deploy")?.needs, [
	{ job: "build", when: undefined },
	{ job: "smoke", when: "build succeeded" },
]);
assertEquals(ran, false);
```

A dry run plans the targets of every `needsIf`, since it can't know yet
which guards will hold, and it returns the same graph errors as a run would.
A plan must be pure for this to be safe: it runs during the dry run too.

## How to cancel a run

This guide shows you how to stop a run from outside, stop it at the first
failure, and keep a failure from stopping it.

1. Pass `signal` to `runJobs`. Aborting it aborts `r.signal` in every job.
2. In each body, hand `r.signal` to whatever does the work (`fetch`, a
   subprocess, a timer). Cancellation is cooperative: a body that ignores
   its signal runs to the end.
3. A body that rejects with the signal's reason, or with an `AbortError`,
   ends `Cancelled`. Any other error is `Failed`, even after the abort.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, Cancelled, defineJobs, runJobs } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

/** Waits `ms`, or rejects with the signal's reason when it aborts. */
function sleep({
	ms,
	signal,
}: {
	readonly ms: number;
	readonly signal: AbortSignal;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

const { job } = defineJobs(() => ({}));

const download = job({
	name: "download",
	run: (r) => sleep({ ms: 60_000, signal: r.signal }),
});
const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ download: p.needs(download) }),
	runIf: always(),
	run: (r, { download }) => [download.isCancelled(), r.signal.aborted],
});

const controller = new AbortController();
setTimeout(() => controller.abort(new Error("interrupted")), 10);

const report = unwrap(
	await runJobs({
		jobs: { cleanup },
		meta: null,
		signal: controller.signal,
	}),
);

assertEquals(report.all.get("download"), Cancelled());
assertEquals(report.outcomes.cleanup.value().unwrap(), [true, true]);
assertEquals(report.passed, false);
```

To stop at the first failure, pass `failFast: true`. A job that fails then
cancels the run, as if you had aborted the run's signal. A job with
`continueOnError: true` is exempt: its failure doesn't cancel the run, and
doesn't fail the run's verdict.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { Cancelled, defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";

const { job } = defineJobs(() => ({}));

const slow = job({
	name: "slow",
	run: (r) => {
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => resolve("done"), 50);
			r.signal.addEventListener("abort", () => {
				clearTimeout(timer);
				reject(r.signal.reason);
			});
		});
	},
});
const lint = job({
	name: "lint",
	run: (): void => {
		throw new Error("lint failed");
	},
});
const flaky = job({
	name: "flaky",
	continueOnError: true,
	run: (): void => {
		throw new Error("flaky");
	},
});

const strict = unwrap(
	await runJobs({ jobs: { lint, slow }, meta: null, failFast: true }),
);
assertEquals(strict.outcomes.slow, Cancelled());

const lenient = unwrap(
	await runJobs({ jobs: { flaky, slow }, meta: null, failFast: true }),
);
assertEquals(lenient.outcomes.slow, Succeeded("done"));
assert(lenient.outcomes.flaky.isFailed());
assert(lenient.passed);
```

`continueOnError` changes the verdict, not the graph. A job that needs the
flaky one is still `Blocked` when it fails, and that blocked job fails the
verdict.

## How to hand an outcome to `Result` code

This guide shows you how to pass a job's outcome to code that speaks
`Result`, from `@sekhmet/enum/result`.

1. Call `toResult()` on the outcome. A success becomes `Ok` with its value;
   anything else becomes `Err` holding the outcome, so the reason survives.
2. To keep the outcome but treat a failure as data, call `catchFailure()`.
   A success holds `Ok(value)`, a failure becomes a success holding
   `Err(error)`, and `Failed` is gone from the type.

```ts
import { match } from "@sekhmet/enum/core/mini";
import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
import { Blocked, Failed, Succeeded } from "@sekhmet/job/outcome";
import { assert, assertEquals } from "@std/assert";

assertEquals(Succeeded("dist").toResult().unwrap(), "dist");

const blocked = Blocked<string>(["lint"]).toResult();
assert(isErr(blocked));
assertEquals(unwrapErr(blocked).blockedBy().unwrap(), ["lint"]);

const caught = Failed<string>(new Error("boom")).catchFailure();
const line = match(caught)({
	Succeeded: (result) => (isErr(result) ? "failed, caught" : "built"),
	Skipped: () => "skipped",
	Blocked: () => "blocked",
	Cancelled: () => "cancelled",
});
assertEquals(line, "failed, caught");
```

The outcome constructors take the success type when it can't be inferred,
as in `Blocked<string>(["lint"])`, the way enum's `None<T>()` does.

## How to report progress from inside a job

This guide shows you how to show the parts of a long job as they happen,
for a CLI that prints a line per step.

1. Wrap each part of the body in `r.step({ name, run })`. It returns what
   `run` returns.
2. Pass `onEvent` to `runJobs`. It receives a `JobEvent` as each job and
   step starts and ends.
3. Render each event with enum's `match`. Keep `onEvent` from throwing: a
   throw cancels the run, and `runJobs` rejects with it once every job has
   settled.

```ts
import { match } from "@sekhmet/enum/core/mini";
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, type JobEvent, runJobs } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs(() => ({}));

const build = job({
	name: "build",
	run: async (r) => {
		await r.step({ name: "compile", run: () => {} });
		return await r.step({ name: "bundle", run: () => "dist" });
	},
});

const lines: string[] = [];
const render = (event: JobEvent): string => {
	return match(event)({
		Started: ({ job }) => `▶ ${job}`,
		StepStarted: ({ job, step }) => `  ▶ ${job} / ${step}`,
		StepSucceeded: ({ job, step }) => `  ✓ ${job} / ${step}`,
		StepFailed: ({ job, step }) => `  ✗ ${job} / ${step}`,
		Finished: ({ job, outcome }) => {
			return `${outcome.isSucceeded() ? "✓" : "✗"} ${job}`;
		},
		Skipped: ({ job }) => `- ${job}`,
		Blocked: ({ job, blockedBy }) => `✗ ${job} (blocked by ${blockedBy})`,
		Cancelled: ({ job }) => `✗ ${job} (cancelled)`,
	});
};

unwrap(
	await runJobs({
		jobs: { build },
		meta: null,
		onEvent: (event) => lines.push(render(event)),
	}),
);

assertEquals(lines, [
	"▶ build",
	"  ▶ build / compile",
	"  ✓ build / compile",
	"  ▶ build / bundle",
	"  ✓ build / bundle",
	"✓ build",
]);
```

A step that throws is reported as `StepFailed`, then its error is rethrown
into the body, which fails the job unless the body catches it. A job's
terminal event (`Finished`, `Skipped`, `Blocked` or `Cancelled`) always
comes after the terminal events of every job it needs.

## How to match on an outcome

This guide shows you how to handle every way a job can end.

1. Import `match` from `@sekhmet/enum/core/mini`. `JobOutcome` has no
   `match` method of its own: matching is the one place outcome code uses
   enum's function.
2. Give one arm per variant: `Succeeded`, `Failed`, `Skipped`, `Blocked`
   and `Cancelled`. The compiler rejects a missing arm.

```ts
import { match } from "@sekhmet/enum/core/mini";
import {
	Blocked,
	Cancelled,
	Failed,
	type JobOutcome,
	Skipped,
	Succeeded,
} from "@sekhmet/job/outcome";
import { assertEquals } from "@std/assert";

const describe = (outcome: JobOutcome<string>): string => {
	return match(outcome)({
		Succeeded: (value) => `built ${value}`,
		Failed: (error) => `failed: ${String(error)}`,
		Skipped: () => "skipped",
		Blocked: (blockedBy) => `blocked by ${blockedBy.join(", ")}`,
		Cancelled: () => "cancelled",
	});
};

assertEquals(describe(Succeeded("dist")), "built dist");
assertEquals(describe(Blocked(["lint", "test"])), "blocked by lint, test");
assertEquals(describe(Failed(new Error("boom"))), "failed: Error: boom");
assertEquals(describe(Skipped()), "skipped");
assertEquals(describe(Cancelled()), "cancelled");
```

When you care about one case, a predicate reads better: `isSucceeded()`,
`isBlocked()` and the rest narrow the outcome, and the pairs `isPassing()`
/ `isFailing()` and `isHealthy()` / `isUnhealthy()` group the variants. See
[the outcome algebra](./concepts.md#the-outcome-algebra) for what each pair
means.
