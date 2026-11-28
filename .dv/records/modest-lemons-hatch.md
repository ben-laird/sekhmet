---
type: fix
packages:
  - "@sekhmet/panic"
---

A thenable that rejects synchronously inside its then call, under a hook that throws, no longer loses the Panic (PanicHook): it escapes catchUnwind, as when then itself throws (#114)
