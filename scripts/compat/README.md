# @sekhmet/compat

Runs every published package's unit test suite (`packages/*/**/*.test.ts`) on a
runtime other than Deno, to back the runtime-compatibility claims on JSR
([#20](https://github.com/ben-laird/sekhmet/issues/20)). Unpublished
infrastructure; `deno task ci` stays Deno-only and does not run it.

```sh
deno task compat:test <runtime>   # node | bun | chromium | firefox | webkit | workerd
```

It prints any failure with its error, then a per-package table (test files,
files that failed to load, tests passed/failed/ignored, steps passed/failed)
and a verdict. Exit codes:

| Code | Meaning                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Every file loaded and every test and step passed                                                                                                   |
| 1    | A test or step failed, a file failed to load, a file used `only`, or no tests ran                                                                  |
| 2    | Usage error (no or unknown runtime), the bundle failed, or the runtime could not run the suite (not installed, crashed, timed out after 5 minutes) |

## How it works

1. **Bundle.** It finds every package test file, generates a suite entry that
   lazily imports each one, and bundles it with `deno bundle --code-splitting`
   (which honours the workspace import maps: `@/`, `@sekhmet/*`, `@std/*`) into
   plain ESM: `suite.js`, one chunk per test file, and shared chunks.
2. **Shim.** Before each file loads, a fresh harness (`src/harness.ts`) is
   installed as `globalThis.Deno = { test, noColor: true }`. Loading the file
   registers its tests; the harness then runs them in order. It supports every
   `Deno.test` call form, `ignore`, `only` (which fails the run, as in Deno), and
   nested async `t.step` (a failed or un-awaited step fails its parent). A
   test is judged once, when its body ends: a step still running then is
   reported failed as not awaited, and nothing it does later changes the
   report.
3. **Run.** Each runtime runs `suite.js` and hands back a JSON report, which is
   validated (Zod) and summarized:
   - **node, bun:** `node run.mjs <report.json>` / `bun run.mjs <report.json>`.
   - **chromium, firefox, webkit:** Playwright opens a headless page on
     `http://compat.test` (served from the bundle by request interception;
     plain HTTP on purpose, so the run proves the packages need no secure
     context) and evaluates `import("/suite.js")`.
   - **workerd:** Miniflare runs a module worker whose `fetch` handler runs the
     suite and returns the report. No `nodejs_compat` flag; compatibility date
     2026-07-30.

What it does not check:

- **Deno's sanitizers** (`sanitizeOps`, `sanitizeResources`, `sanitizeExit`)
  and `permissions` are ignored; no package test sets them, and `deno task ci`
  still enforces the sanitizers on Deno.
- **Doc tests** (`deno test --doc`) are not run; they stay Deno-only.
- The bundle keeps modern syntax as written (e.g. `using` declarations in the
  tests), so each runtime must parse it natively.

## What each runtime needs installed

The Deno side needs only Deno (`deno.json` pins `playwright` and `miniflare`;
Deno fetches them on first run).

| Runtime    | Needs                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| `node`     | `node` on `PATH` (tested on v26)                                                       |
| `bun`      | `bun` on `PATH` (tested on 1.3)                                                        |
| `chromium` | Playwright's browser: `deno run -A npm:playwright@1.65.1 install --with-deps chromium` |
| `firefox`  | `deno run -A npm:playwright@1.65.1 install --with-deps firefox`                        |
| `webkit`   | `deno run -A npm:playwright@1.65.1 install --with-deps webkit`                         |
| `workerd`  | Nothing extra: the `workerd` binary comes with the pinned `miniflare` npm package      |

Keep the Playwright version in the install command equal to the `playwright`
pin in `scripts/compat/deno.json`: each Playwright release expects its own
browser builds. `--with-deps` installs the system libraries the browsers need
(Linux CI); drop it on macOS. Deno warns that `npm:workerd`'s build script was
ignored; the run does not need it, since Deno installs the platform binary
package directly.
