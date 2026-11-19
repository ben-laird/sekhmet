# @sekhmet/job

Named jobs that run as a dependency graph, in the style of GitHub Actions
and other CI runners, built on the language's own promises and
`AbortSignal`. A job pairs a pure **plan**, its dependency list, with a
**run**, which receives that list with each need resolved. A **`runIf`**
decides, once the needs settle, whether the run is called. Each job runs
once per run, however many jobs need it, and ends with a `JobOutcome`:
`Succeeded`, `Failed`, `Skipped`, `Blocked` or `Cancelled`.

## Status

**Prototype, unpublished.** The package's `deno.json` sets
`"publish": false` while its design is confirmed in
[#57](https://github.com/ben-laird/sekhmet/issues/57), and its API may change
without notice. It isn't on JSR, so use it from inside this repository: every
`packages/*` directory is a workspace member, and any module in the
repository can import `@sekhmet/job`.

## Example

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { always, Blocked, defineJobs, runJobs } from "@sekhmet/job";
import { assertEquals } from "@std/assert";

const { job } = defineJobs((_meta: { readonly log: string[] }) => ({}));

const lint = job({
	name: "lint",
	run: (): void => {
		throw new Error("unused variable");
	},
});

const build = job({ name: "build", run: () => "dist" });

const deploy = job({
	name: "deploy",
	plan: (p) => ({ linted: p.needs(lint), site: p.needs(build) }),
	run: (r, { site }) => r.meta.log.push(`deployed ${site}`),
});

const cleanup = job({
	name: "cleanup",
	plan: (p) => ({ deploy: p.needs(deploy) }),
	runIf: always(),
	run: (r, { deploy }) => {
		r.meta.log.push(
			`cleaned up after ${deploy.isBlocked() ? "a block" : "a deploy"}`,
		);
	},
});

const log: string[] = [];
const report = unwrap(
	await runJobs({ jobs: { deploy, cleanup }, meta: { log } }),
);

assertEquals(report.outcomes.deploy, Blocked(["lint"]));
assertEquals(log, ["cleaned up after a block"]);
assertEquals(report.passed, false);
```

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds a deploy
  pipeline step by step: jobs that need each other, a failure, a cleanup,
  and the typed report.
- **How-to guides:** [Recipes](./docs/recipes.md) for needing a job only
  when another succeeded, cleaning up or notifying after a failure, cleaning
  up resources, writing
  your own `runIf`, generating jobs from data with `family`, previewing a
  run, cancelling a run, handing an outcome to `Result` code, reporting
  progress with `r.step`, and matching on an outcome.
- **Explanation:** [Concepts](./docs/concepts.md) covers plan and run,
  the three lifetimes (`meta`, a job's context and cleanup, steps),
  conditions as data and the GitHub Actions mapping, once per run, the
  outcome algebra, planning before running, cancellation, and how job
  differs from `@sekhmet/effect`.
- **Reference:** the TSDoc in the source, starting at [`mod.ts`](./mod.ts)
  and [`@sekhmet/job/outcome`](./src/outcome/main/mod.ts). The package isn't
  on JSR, so there is no hosted API reference yet; `deno doc
  packages/job/mod.ts` prints it.

The published docs site leaves out unpublished packages, so these guides join
it once the package is published. Until then, `deno task docs:dev` previews
them locally, each page under a prototype banner.

## Design record

The
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/job.md)
keeps the history of the package's design decisions and the alternatives they
replaced.

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/job/LICENSE.md).
