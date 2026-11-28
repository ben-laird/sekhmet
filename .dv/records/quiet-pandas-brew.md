---
type: feat!
packages:
  - "@sekhmet/dispatch"
---

DispatchSignal.dispatched({ value }) takes no panic runtime: its listeners run at once inside the whenDispatched call that adds them, so a listener that throws now propagates to that caller instead of being caught and reported (#114)
