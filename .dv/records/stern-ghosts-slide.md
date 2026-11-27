---
type: feat!
packages:
  - "@sekhmet/schema"
---

Remove schema's own PanicBoundary type: ParseOptions and toStandard take @sekhmet/panic's PanicBoundary (catchUnwind and resumeUnwind). Pass the panic runtime as before. In an async parse, a hook that throws now settles the parse as Panicked, and its failure escapes as an unhandled rejection (#114)
