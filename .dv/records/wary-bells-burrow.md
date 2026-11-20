---
type: fix!
packages:
  - "@sekhmet/vow"
---

Make Vow covariant in T (Vow<out T>): Pending now holds a subscribe function instead of the array of dependents, so code that matched on Pending's deps gets subscribe
