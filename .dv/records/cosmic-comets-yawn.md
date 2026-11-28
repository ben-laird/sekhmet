---
type: fix
packages:
  - "@sekhmet/lifetime"
---

The panic hook now reports init's Panic (InitFailed) wrapper, with the original payload as its cause, instead of the raw payload; the SetupTeardownFailed carrier is recorded as reported without reaching the hook. Unwrapping start's Panicked into an outer boundary of the same runtime no longer reports it again (#114)
