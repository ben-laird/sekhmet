---
kind: tutorial
---

# Getting started

In this tutorial we will build a small deploy pipeline: lint the code, run
the tests and build the site, deploy it, and clean up afterwards. We will
start with one job, connect jobs through what they need, watch a failure
travel through the graph, add a cleanup that runs whatever happens, and
finish by reading the typed report. Each step is a complete program you can
run.

## Use the package

`@sekhmet/job` is a prototype and isn't on JSR yet: its `deno.json` sets
`"publish": false`. To follow along, work inside the Sekhmet repository. The
root `deno.json` makes every `packages/*` directory a workspace member, so any
module in the repository can import `@sekhmet/job`, and `@std/assert`, which
each step uses to check its output, is already in the root import map.

## Run one job

First, we define a job that lints the code. Our jobs run commands, so we
give every run a context with a `sh` function. Here it only records each
command, which keeps the tutorial runnable anywhere:

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

const { job } = defineJobs<Shell>();

const lint = job({ name: "lint", run: (t) => t.context.sh("deno lint") });

const ran: string[] = [];
const shell: Shell = {
	sh: async (command) => {
		ran.push(command);
	},
};
const report = unwrap(await runJobs({ jobs: { lint }, context: shell }));

assertEquals(report.outcomes.lint, Succeeded(undefined));
assertEquals(ran, ["deno lint"]);
```

`defineJobs<Shell>()` fixes the context type, so `t.context.sh` is typed in
every job we define with this `job`. `runJobs` takes the jobs to run as a
record, and its report gives each one's outcome under the same key. It infers
the context's type from the value we hand it, so we annotate `shell` as a
`Shell` where we write it. The
lint job returned nothing, so it `Succeeded` with `undefined`.

`runJobs` returns a `Result`, because a set of jobs might not form a valid
graph. Ours does, so we `unwrap` it.

## Connect jobs through what they need

Next, we add the tests, the build and the deploy. A job declares what it
needs in its `plan`, and its `run` receives what those jobs returned:

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

const { job } = defineJobs<Shell>();

const lint = job({ name: "lint", run: (t) => t.context.sh("deno lint") });

const test = job({
	name: "test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: (t) => t.context.sh("deno test"),
});

const build = job({
	name: "build",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: async (t) => {
		await t.context.sh("deno task build");
		return "dist";
	},
});

const deploy = job({
	name: "deploy",
	plan: (p) => ({ tested: p.needs(test), site: p.needs(build) }),
	run: (t, { site }) => t.context.sh(`deploy ${site}`),
});

const ran: string[] = [];
const shell: Shell = {
	sh: async (command) => {
		ran.push(command);
	},
};
const report = unwrap(await runJobs({ jobs: { deploy }, context: shell }));

assertEquals(report.outcomes.deploy, Succeeded(undefined));
assertEquals(ran.length, 4);
assertEquals(ran[0], "deno lint");
assertEquals(ran[3], "deploy dist");
```

We only asked for `deploy`, but everything it needs ran first. Lint ran once,
although both `test` and `build` need it: a job runs once per run, and every
job that needs it shares its result. `test` and `build` don't need each
other, so they ran side by side once lint passed.

Inside `deploy`, `site` is the string `"dist"` that `build` returned, typed
from the plan with no annotation.

## Watch a failure

Now let's make the tests fail. Our shell throws for `deno test`, as a real
one would on a non-zero exit:

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { Blocked, defineJobs, runJobs, Succeeded } from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";

interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

const { job } = defineJobs<Shell>();

const lint = job({ name: "lint", run: (t) => t.context.sh("deno lint") });

const test = job({
	name: "test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: (t) => t.context.sh("deno test"),
});

const build = job({
	name: "build",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: async (t) => {
		await t.context.sh("deno task build");
		return "dist";
	},
});

const deploy = job({
	name: "deploy",
	plan: (p) => ({ tested: p.needs(test), site: p.needs(build) }),
	run: (t, { site }) => t.context.sh(`deploy ${site}`),
});

const ran: string[] = [];
const shell: Shell = {
	sh: async (command) => {
		ran.push(command);
		if (command === "deno test") throw new Error("deno test exited 1");
	},
};
const report = unwrap(await runJobs({ jobs: { deploy }, context: shell }));

assert(report.all.get("test")?.isFailed());
assertEquals(report.all.get("build"), Succeeded("dist"));
assertEquals(report.outcomes.deploy, Blocked(["test"]));
assertEquals(report.passed, false);
assert(!ran.includes("deploy dist"));
```

The throw didn't escape `runJobs`: it became the test job's `Failed`
outcome. `build` doesn't need the tests, so it still ran. `deploy` needs
both, so it never started: it is `Blocked`, naming the need that stopped it.

`report.all` holds every job the run reached, by name, in the order they
settled, while `report.outcomes` holds only the ones we passed in. `report.passed` is
`false`, since a job failed.

## Clean up whatever happens

The build leaves a `dist` directory behind, and we want it gone even when
the deploy doesn't happen. A job's `runIf` decides whether it runs once its
needs have settled. The default is `success()`, which runs only when every
need succeeded. A cleanup wants `always()`:

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, defineJobs, runJobs } from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";

interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

const { job } = defineJobs<Shell>();

const lint = job({ name: "lint", run: (t) => t.context.sh("deno lint") });

const test = job({
	name: "test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: (t) => t.context.sh("deno test"),
});

const build = job({
	name: "build",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: async (t) => {
		await t.context.sh("deno task build");
		return "dist";
	},
});

const deploy = job({
	name: "deploy",
	plan: (p) => ({ tested: p.needs(test), site: p.needs(build) }),
	run: (t, { site }) => t.context.sh(`deploy ${site}`),
});

const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ site: p.needs(build), deploy: p.needs(deploy) }),
	runIf: always(),
	run: async (t, { site, deploy }) => {
		await t.context.sh(`rm -rf ${site.value().unwrapOr("dist")}`);
		return deploy.isSucceeded();
	},
});

const ran: string[] = [];
const shell: Shell = {
	sh: async (command) => {
		ran.push(command);
		if (command === "deno test") throw new Error("deno test exited 1");
	},
};
const report = unwrap(
	await runJobs({ jobs: { deploy, cleanup }, context: shell }),
);

assertEquals(report.outcomes.cleanup.value().unwrap(), false);
assert(ran.includes("rm -rf dist"));
```

Because the cleanup may run when its needs didn't succeed, its `run` gets
each need's outcome rather than its value. `site` is the build's outcome,
and `site.value()` is the directory if the build succeeded. `deploy` is the
deploy's outcome, `Blocked` here, so the cleanup returns `false`.

We now pass two roots, `deploy` and `cleanup`. The cleanup needs the deploy
anyway, but naming both puts both in `report.outcomes`.

## Read the report

Last, we turn the report into something to print. Each root's outcome is
typed by its job, and enum's `match` makes us handle every way a job can end:

```ts
import { match } from "@sekhmet/enum/core/mini";
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, defineJobs, type JobOutcome, runJobs } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

interface Shell {
	readonly sh: (command: string) => Promise<void>;
}

const { job } = defineJobs<Shell>();

const lint = job({ name: "lint", run: (t) => t.context.sh("deno lint") });

const test = job({
	name: "test",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: (t) => t.context.sh("deno test"),
});

const build = job({
	name: "build",
	plan: (p) => ({ lint: p.needs(lint) }),
	run: async (t) => {
		await t.context.sh("deno task build");
		return "dist";
	},
});

const deploy = job({
	name: "deploy",
	plan: (p) => ({ tested: p.needs(test), site: p.needs(build) }),
	run: (t, { site }) => t.context.sh(`deploy ${site}`),
});

const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ site: p.needs(build), deploy: p.needs(deploy) }),
	runIf: always(),
	run: async (t, { site, deploy }) => {
		await t.context.sh(`rm -rf ${site.value().unwrapOr("dist")}`);
		return deploy.isSucceeded();
	},
});

const shell: Shell = {
	sh: async (command) => {
		if (command === "deno test") throw new Error("deno test exited 1");
	},
};
const report = unwrap(
	await runJobs({ jobs: { deploy, cleanup }, context: shell }),
);

const deployed: JobOutcome<void> = report.outcomes.deploy;
const cleanedUp: JobOutcome<boolean> = report.outcomes.cleanup;

const summary = match(deployed)({
	Succeeded: () => "deployed",
	Failed: (error) => `deploy failed: ${String(error)}`,
	Skipped: () => "deploy skipped",
	Blocked: (blockedBy) => `deploy blocked by ${blockedBy.join(", ")}`,
	Cancelled: () => "deploy cancelled",
});

assertEquals(summary, "deploy blocked by test");
assertEquals(cleanedUp.isSucceeded(), true);
assertEquals(report.all.size, 5);
```

`report.outcomes.deploy` is a `JobOutcome<void>` and
`report.outcomes.cleanup` a `JobOutcome<boolean>`, as `Promise.all` types
each promise it's given. A job ends in one of five ways: `Succeeded`,
`Failed`, `Skipped`, `Blocked` or `Cancelled`. `match` takes one arm per
way, so the compiler tells us if we forget one.

## What we built

You have built a deploy pipeline as a graph of jobs. Each job declared what
it needs, ran once, and handed its result to the jobs after it. A failure
blocked only what depended on it, a cleanup ran anyway, and the run ended
with a typed report instead of a thrown error.

From here:

- [Recipes](./recipes.md) show how to make a need conditional, notify on
  failure, generate jobs from data, preview a run, cancel one, and more.
- [Concepts](./concepts.md) explain why a plan is separate from its run,
  how outcomes combine, and how job relates to GitHub Actions.
- The API reference is the TSDoc in the source, starting at
  [`mod.ts`](../mod.ts).
