---
type: feat
packages:
  - "@sekhmet/panic"
---

Add Outcome<T, E, P> (Ok/Err/Panicked) at @sekhmet/panic/outcome, keeping a thrown bug apart from an expected error: the ordinary combinators pass a panic through untouched, and the panic channel has isPanicAnd, mapPanic, recover and resume (#86)
