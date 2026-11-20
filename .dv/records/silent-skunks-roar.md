---
type: feat
packages:
  - "@sekhmet/vow"
---

Add andThen, which chains a step that returns a Vow and stays synchronous when every step is, and a synchronous read of a vow's state: value (Some(value) once resolved, None while pending) and the type guards isResolved and isPending
