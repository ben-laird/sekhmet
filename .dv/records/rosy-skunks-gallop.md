---
type: feat!
packages:
  - "@sekhmet/panic"
---

One catchUnwind(fn) for sync and async work, returning a Vow<Outcome<T, never, unknown>>: sync work settles it before the call returns, a returned thenable is adopted (its rejection is Panicked), and dependents of an async vow run inside the boundary. catchUnwindAsync is removed. A hook that throws on async work no longer rejects a promise: the vow settles as Panicked and the Panic (PanicHook) escapes as an unhandled rejection. Panic now depends on @sekhmet/vow (#114)
