# Lessons

Rules learned from corrections in this repo. Each carries a one-line _why_.

- **Agents never rewrite history,** not even a `git reset --soft` on an unpushed
  branch. Add a new commit instead. _Why: an agent soft-reset its branch during
  the 0.1.0 prep (2026-11-16)._
- **After fixing a failing check, re-run that exact check before committing.**
  A format-then-commit chain proves formatting, not lint, types or doc lint.
  _Why: two fixes were committed on a red gate during the 0.1.0 prep
  (2026-11-16)._
