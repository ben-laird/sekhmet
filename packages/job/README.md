# Job

> **Prototype, unpublished.** `@sekhmet/job` is marked `"publish": false` while
> its design is confirmed in
> [#57](https://github.com/ben-laird/sekhmet/issues/57). Its API may change
> without notice.

Named jobs run as a dependency graph, in the style of GitHub Actions and other
CI runners, built on the language's own promises and `AbortSignal`. A job pairs
a **plan**, which declares what it needs as plain data, with a **run**, which
receives that data with each need resolved. Each job runs once per run, however
many jobs need it, and ends with a `JobOutcome`: `Succeeded`, `Failed`,
`Skipped`, `Blocked` or `Cancelled`.

## Example

```ts
import { isolate } from "@sekhmet/enum/core/mini";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import {
	defineJobs,
	type JobEvent,
	planJobs,
	runJobs,
	Skipped,
	Succeeded,
	skip,
} from "@sekhmet/job";
import { assertEquals } from "@std/assert";

// The context every plan and run can read: config and a logger, not data
const { job, observer } = defineJobs<{
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

const publish = job({
	name: "publish",
	// A staged plan: it awaits a result to decide what else it needs
	plan: async (p) => {
		const versioned = await p.result(version);
		if (isErr(versioned)) return versioned; // give up: Blocked by version
		if (!p.context.release) return skip();
		return {
			build: p.needs(build),
			channel: unwrap(versioned).startsWith("0.") ? "beta" : "stable",
		};
	},
	run: (_t, { build, channel }) => `${build.outDir} -> ${channel}`,
});

// failure(): an observer, so it runs even when the run is cancelled
const notify = observer({
	name: "notify",
	plan: async (p) => (isolate(await p.outcome(build), "Failed") ? {} : skip()),
	run: () => "paged",
});

// The dry run: plans only, no bodies
const graph = unwrap(
	await planJobs({
		jobs: [publish, notify],
		context: { release: true, log: [] },
	}),
);
assertEquals([...graph.jobs.keys()], ["publish", "version", "notify", "build"]);

// The run
const events: JobEvent[] = [];
const log: string[] = [];
const report = unwrap(
	await runJobs({
		jobs: [publish, notify],
		context: { release: true, log },
		onEvent: (event) => events.push(event),
	}),
);

assertEquals(report.outcomes.get("publish"), Succeeded("dist -> stable"));
assertEquals(report.outcomes.get("notify"), Skipped());
assertEquals(log, ["compile 1.4.0"]);
assertEquals(report.passed, true);
```

## Concepts

- **`defineJobs<C>()`** fixes the run's context type `C` and returns `job`
  and `observer`.
- **`job({ name, plan?, run, continueOnError? })`** defines a job.
  - `plan(p)` may be async, and returns a plain object of handles from
    `p.needs(job)` plus any data, or `skip()`. A job that needs nothing omits
    it.
  - `p.result(job)` waits for a job's value (a staged plan) and resolves to
    `Ok(value)`, or `Err` with the job's outcome if it didn't succeed. The
    plan always resumes; the awaited job then counts as a need, so the job
    ends `Blocked` (or `Skipped`/`Cancelled`) before its run. Return the `Err`
    to give up early. `p.outcome(job)` waits for its outcome and never
    blocks, so `always`/`failure` conditions are ordinary code.
- **`observer({ name, plan, run, continueOnError? })`** defines an observer:
  a job whose plan's `p` has only `context` and `outcome` (no `needs`, no
  `result`), and returns plain data or `skip()`. Use it for `always()`
  cleanups and `failure()` notifiers.
  - `run(t, plan)` receives the plan with its top-level handles resolved and
    typed `Readonly`, inferred from `plan` with no annotations. `t` has
    `context`, `signal` and `step({ name, run })`.
- **`runJobs({ jobs, context, signal?, failFast?, onEvent? })`** runs every
  job reachable from the roots once and returns
  `Result<RunReport, GraphError>`. A failed or blocked need makes a job
  `Blocked` without starting it; a throw becomes `Failed`; a duplicate name or
  a cycle is an `Err`, never a throw or a hang.
- **Cancellation** (the run's `signal`, `failFast`, or a graph error) aborts
  every body's `t.signal`, and jobs that haven't started end `Cancelled`.
  Observers are never cancelled, whatever their plan awaits and whenever:
  they run with `t.signal` already aborted, as GitHub Actions runs `always()`
  jobs. A `job` whose plan happens to await only `p.outcome` is still an
  ordinary job, and is cancelled. A body that throws
  after the abort ends `Cancelled` only if it threw the abort itself (the
  signal's `reason`, or an `AbortError`); any other error is `Failed`.
- **`planJobs({ jobs, context })`** is the dry run: it calls every plan and
  returns the graph, with a plan that awaits a result reported `Pending` on
  that job. There `p.result` never settles, so code after it (`finally`
  included) doesn't run in a dry run. `graph.observers` names the observers.
