---
type: feat!
packages:
  - "@sekhmet/dispatch"
---

Remove CatchUnwind: new DispatchController({ panics }), DispatchSignal.dispatched({ value, panics }) and DispatchSignal.fromAbortSignal({ signal, panics }) take @sekhmet/panic's PanicBoundary, the runtime itself, instead of runtime.catchUnwind (#114)
