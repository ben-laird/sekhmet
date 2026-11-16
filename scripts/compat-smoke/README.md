# @sekhmet/compat-smoke

Smoke-tests the **published** `@sekhmet` packages on the runtimes JSR lists
them for. Unpublished; the second layer of the compatibility checks in
[#20](https://github.com/ben-laird/sekhmet/issues/20). The first layer, the
unit suite on each runtime, is `deno task compat:test`.

```sh
deno task compat:smoke <node|bun|chromium|firefox|webkit|workerd> [options]

  --version <version>         test every package at <version> (default: latest)
  --version <name>@<version>  test one package at <version>, e.g. @sekhmet/enum@0.1.0
  --keep                      keep the temporary project and print its path
```

## What a run does

1. Lists the packages the repository publishes (`packages/*`, minus any
   `"publish": false`) and reads each one's version and `exports` from
   jsr.io: the latest unless `--version` names one.
2. In a new temporary directory (never inside the repository), installs them
   the way a user of the runtime would:

   | Runtime                         | Install                                                                                                | Run                                                    |
   | ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
   | `node`                          | `npx jsr add`                                                                                          | `node`, resolving packages from `node_modules`         |
   | `bun`                           | `bunx jsr add`                                                                                         | `bun`, resolving packages from `node_modules`          |
   | `chromium`, `firefox`, `webkit` | `npm install @sekhmet/x@npm:@jsr/sekhmet__x@<version>` from `https://npm.jsr.io`, bundled with esbuild | Playwright, on a plain-`http` page (no secure context) |
   | `workerd`                       | the same npm install, bundled into one Worker module                                                   | Miniflare (workerd)                                    |

3. Imports **every export path** each package publishes (root, every subpath,
   every `/mini` path and single-function path) and runs one exercise per
   package through its main and mini entrypoints (`probe/exercises/`).
4. Prints a per-package, per-export-path summary and exits non-zero on any
   failure: a path that does not load, a failed exercise, or a package
   installed at a different version than the one under test.

Exit codes: `0` passed, `1` a smoke check failed, `2` usage error, `3` setup
failed (registry, install or build).

## Requirements

Deno, plus the runtime under test: Node.js (and npm) for `node`, the browsers
and `workerd`; Bun for `bun`. A run installs its own tools at the versions
pinned in `src/plan.ts` (`TOOLS`), including the Playwright browser it needs.
On Linux CI, install the browser's system libraries first with
`npx playwright@<TOOLS.playwright> install-deps <engine>`.

## Layout

- `main.ts`: the CLI, the only code with I/O
- `src/`: pure pieces (argument parsing, registry lookup, the install plan,
  the entry module, judging the report), each with tests
- `probe/`: the code that runs inside the runtime under test; it uses no
  runtime-specific API. `probe/exercises/` holds one exercise per package,
  type-checked and run against the workspace source by `deno task ci`
- `runners/`: the Node scripts that drive Playwright and Miniflare; copied
  into the temporary project, so Deno does not check them

A new published package needs an exercise in `probe/exercises/`;
`src/workspace.test.ts` fails until it has one.
