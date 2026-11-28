---
type: fix
packages:
  - "@sekhmet/panic"
---

A throwing dependent of an async catchUnwind vow is reported throw by throw, not as the vow's AggregateError, so a dependent that unwraps a Panicked no longer reports its payload twice (#114, #105)
