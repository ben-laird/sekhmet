# Job

> **Prototype, unpublished.** `@sekhmet/job` is marked `"publish": false` while
> its design is confirmed in
> [#57](https://github.com/ben-laird/sekhmet/issues/57). Its API may change
> without notice.

Named jobs run as a dependency graph, in the style of GitHub Actions and other
CI runners, built on the language's own promises and `AbortSignal`. Each job
ends a run with a `JobOutcome`: `Succeeded`, `Failed`, `Skipped`, `Blocked` or
`Cancelled`.
