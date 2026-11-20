---
type: feat
packages:
  - "@sekhmet/dispatch"
links:
  - "https://github.com/ben-laird/sekhmet/issues/70"
---

Add `@sekhmet/dispatch`, a typed one-shot signal: `DispatchController<T>` and its `DispatchSignal<T>`, shaped like `AbortController`/`AbortSignal` with a typed value instead of `reason: any`. `dispatch` returns the value already there as an `Option`; listeners added after the dispatch still run, a throwing listener is isolated by the panic runtime's `catchUnwind`, and signals compose (`map`, `zip`, `DispatchSignal.any`) and convert to promises, vows and `AbortSignal`.
