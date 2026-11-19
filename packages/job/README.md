# Job

> **Prototype, unpublished.** `@sekhmet/job` is marked `"publish": false` while
> its design is confirmed in
> [#57](https://github.com/ben-laird/sekhmet/issues/57). Its API may change
> without notice.

Named jobs run as a dependency graph, in the style of GitHub Actions and other
CI runners, built on the language's own promises and `AbortSignal`. A job pairs
a pure **plan**, which declares what it needs as plain data, with a **run**,
which receives that data with each need resolved. A **`runIf`** decides, once
the needs settle, whether the run is called. Each job runs once per run,
however many jobs need it, and ends with a `JobOutcome`: `Succeeded`, `Failed`,
`Skipped`, `Blocked` or `Cancelled`.

## Example

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import {
	always,
	defineJobs,
	failure,
	type JobEvent,
	planJobs,
	runJobs,
	Skipped,
	Succeeded,
	succeededWith,
} from "@sekhmet/job";
import { assertEquals } from "@std/assert";

// The context every plan and run can read: config and a logger, not data
const { job } = defineJobs<{
	readonly release: boolean;
	readonly log: string[];
}>();

const version = job({ name: "version", run: () => "1.4.0" });

const build = job({
	name: "build",
	plan: (p) => ({ version: p.needs(version) }),
	run: async (t, { version }) => {
		await t.step({
			name: "compile",
			run: () => t.context.log.push(`compile ${version}`),
		});
		return { outDir: "dist", version }; // what dependents receive
	},
});

const sign = job({ name: "sign", run: () => "signature" });

const publish = job({
	name: "publish",
	// A plan is pure data: needs, a guarded need, and plain values
	plan: (p) => {
		const v = p.needs(version);
		const stable = succeededWith({
			need: v,
			where: (value) => !value.startsWith("0."),
			describe: "a stable version",
		});
		return {
			version: v,
			builds: [p.needs(build)], // needs resolve at any depth
			signature: p.needsIf({ job: sign, when: stable }),
			channel: p.context.release ? "stable" : "dry-run",
		};
	},
	run: (_t, { builds, signature, channel }) => {
		return `${builds[0]?.outDir} -> ${channel} (${signature ?? "unsigned"})`;
	},
});

// failure(): runs only if a need is unhealthy, and gets the needs' outcomes
const notify = job({
	name: "notify",
	plan: (p) => ({ publish: p.needs(publish) }),
	runIf: failure(),
	run: (_t, { publish }) =>
		`paged: ${String(publish.error().unwrapOr("blocked"))}`,
});

// always(): runs whatever happened, even after a cancel
const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ build: p.needs(build) }),
	runIf: always(),
	continueOnError: true,
	run: (t) => t.context.log.push("cleanup"),
});

// The dry run: every plan, guards included, and no bodies
const graph = unwrap(
	planJobs({
		jobs: { publish, notify, cleanup },
		context: { release: true, log: [] },
	}),
);
assertEquals(graph.jobs.get("publish")?.needs[2], {
	job: "sign",
	when: "version succeeded with a stable version",
});

// The run: a record of roots, and a report typed per key
const events: JobEvent[] = [];
const log: string[] = [];
const report = unwrap(
	await runJobs({
		jobs: { publish, notify, cleanup },
		context: { release: true, log },
		onEvent: (event) => events.push(event),
	}),
);

assertEquals(report.outcomes.publish, Succeeded("dist -> stable (signature)"));
assertEquals(report.outcomes.notify, Skipped());
assertEquals(log, ["compile 1.4.0", "cleanup"]);
assertEquals(report.passed, true);
```

## Concepts

- **`defineJobs<C>()`** fixes the run's context type `C` and returns `job`.
- **`job({ name, plan?, runIf?, run, continueOnError? })`** defines a job.
  - `plan(p)` is pure and synchronous: it returns a plain object of needs and
    data. `p.needs(job)` declares a need; `p.needsIf({ job, when })` declares
    one pulled in only if the guard `when` holds. Needs may sit anywhere in
    plain arrays and plain objects, at any depth; anything else passes
    through untouched. A job that needs nothing omits `plan`.
  - Guards are data that describe themselves, so a dry run can show them:
    `succeeded(need)`, `failed(need)` and
    `succeededWith({ need, where, describe })`. A guard reads only the
    plan's unconditional needs, which settle first, so the need it reads must
    itself sit in the plan.
  - `runIf` is `success()` (the default), `failure()` (some need is
    unhealthy), `cancelled()`, `always()`, or a hand-written
    `({ context, cancelled, needs }) => boolean`.
  - `run(t, needs)` receives the plan with each need resolved, typed
    `Readonly` and inferred from `plan` with no annotations: the need's value
    under `success()`, its `JobOutcome` under any other `runIf`, and
    `undefined` for a `needsIf` left out. `t` has `context`, `signal` and
    `step({ name, run })`.
- **`runJobs({ jobs, context, signal?, failFast?, onEvent? })`** takes a
  record of roots and returns `Result<RunReport, GraphError>`. The report's
  `outcomes` mirrors the roots, each typed by its job, as `Promise.all` does;
  `all` maps every job reached by name, in the order they settled; and
  `passed` holds when every job reached is passing (`Succeeded` or
  `Skipped`) or `Failed` with `continueOnError`.
  - Every plan is called first, so a duplicate name or a cycle is an `Err`
    before anything starts, never a throw or a hang. A plan that throws is a
    bug, rethrown before anything starts.
  - Under `success()`, a job whose needs aren't all successful ends with
    exactly the outcome `all` gives them: `Blocked` (naming the unhealthy
    needs), `Cancelled` or `Skipped`. Any other `runIf` that is false makes
    the job `Skipped`. A body's throw is `Failed`, never rethrown.
- **Cancellation** (the run's `signal`, or `failFast`) aborts every body's
  `t.signal`. A job runs after a cancel only if its `runIf` holds with
  `cancelled: true`, and it then starts with `t.signal` already aborted, so
  a default job that hasn't started ends `Cancelled`, while an `always()`
  cleanup still runs. A body that throws after the abort ends `Cancelled`
  only if it threw the abort itself (the signal's `reason`, or an
  `AbortError`); any other error is `Failed`. `continueOnError` exempts a
  job's failure from `failFast` and from the verdict.
- **`planJobs({ jobs, context })`** is the dry run: it calls every plan and
  returns the whole graph, with each job's needs, guards and `runIf`.
- **`JobOutcome`** has methods (`@sekhmet/job/outcome`) and tree-shakable
  functions (`@sekhmet/job/outcome/mini`): the variant predicates, the
  `isPassing`/`isFailing` and `isHealthy`/`isUnhealthy` complements,
  `value()`/`error()`/`blockedBy()` as Options, `map`, `toResult` and
  `catchFailure`, plus `all(record)`, which folds outcomes as `Promise.all`
  folds promises. Match on it with enum's root `match(outcome)({ … })`.
