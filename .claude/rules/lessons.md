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
