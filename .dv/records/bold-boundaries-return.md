---
type: feat!
packages:
  - "@sekhmet/panic"
---

catchUnwind and catchUnwindAsync return Outcome<T, never, unknown> (Ok or Panicked) instead of Result<T, unknown>; recover turns a caught panic into an app error, and panicResult gives the old Result (#86)
