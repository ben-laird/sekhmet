---
type: feat!
packages:
  - "@sekhmet/enum"
---

Receiver-constrained methods, as in Rust: main Option's flatten, transpose and unzip are methods whose this parameter is the receiver shape they need (Option<Option<T>>, Option<Result<T, E>>, Option<[T, U]>), replacing main's standalone flatten, transpose and unzip with no aliases (mini keeps its functions). New: Result.transpose for Result<Option<T>, E>, and Poll.mapOk/mapErr for Poll<Result<T, E>>, each in mini and main; main Poll converts a returned Result to a main Result (#72)
