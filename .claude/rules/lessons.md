# Lessons

Rules learned from corrections in this repo. Each carries a one-line _why_.

- **Agents never rewrite history,** not even a `git reset --soft` on an unpushed
  branch. Add a new commit instead. _Why: an agent soft-reset its branch during
  the 0.1.0 prep (2026-11-16)._
- **Never commit on a red gate; the commit gate hook now enforces it.**
  Stage, run `deno task ci`, and commit only on green: `.githooks/pre-commit`
  refuses a staged tree without a green run (CONTRIBUTING.md, "Commit gate").
  After any fix or `git add`, re-run the gate; a format-then-commit chain
  proves formatting, not lint, types or doc lint. Agents never bypass it with
  `--no-verify`. _Why: fixes were committed on a red gate twice during the
  0.1.0 prep, then three more times in one session, so the prose rule became a
  hook (#27, 2026-11-16)._
- **Tests never provoke an unhandled rejection on purpose,** not even behind a
  runtime guard. The compat shim reports one as an uncaught error on Bun,
  workerd and the browsers, so a green `deno task ci` doesn't prove it's
  portable. Document a lost rejection in TSDoc, and run
  `deno task compat:test <runtime>` for any test that touches async error
  paths. _Why: such a test passed the gate but failed five compat suites on
  #45 (2026-11-17)._
- **Package tests never call Deno-only APIs** (`Deno.inspect`,
  `Deno.Command`, …) without a runtime guard such as
  `ignore: typeof Deno.Command !== "function"`. The compat suite runs every
  package test on seven runtimes, and a green `deno task ci` doesn't prove
  it's portable. _Why: nine schema test files used `Deno.inspect` and failed
  compat on Node and Bun while preparing the 0.1.0 release (2026-11-18)._
- **Prototype on a branch in the main checkout, not in `playground/`.** Commit
  early and often, each commit on a green gate, and stub unfinished code with
  `@sekhmet/workflow`'s `todo`/`unimplemented` (which also tests whether the
  workflow library holds up). Back out an approach you don't like with a revert
  commit, never a reset, so the history stays linear and records what was
  rejected. `playground/` is only for trying out an API while an agent builds
  it in a worktree. _Why: the owner wants prototypes version-controlled so
  earlier edits can be recovered (2026-11-21)._
