---
type: feat!
packages:
  - "@sekhmet/lifetime"
---

Remove LifetimePanics: Lifetime and Resource.start take @sekhmet/panic's PanicBoundary. On an async double fault a cleanup or init now fails with its own panic, and the Panic (PanicHook) escapes as an unhandled rejection, instead of becoming the failure (#114)
