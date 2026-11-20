---
type: fix!
packages:
  - "@sekhmet/vow"
---

fromPromise takes { promise, panics } and resolves its vow inside panics.catchUnwind, so a dependent that throws is reported through the panic runtime's hook instead of escaping as an unhandled rejection (#59)
