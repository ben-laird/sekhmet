---
type: feat
packages:
  - "@sekhmet/enum"
---

ControlFlow: Rust's std::ops::ControlFlow at @sekhmet/enum/control-flow (main) and @sekhmet/enum/control-flow/mini. Continue(value) and Break(value) constructors, with ControlFlow<B, C = undefined>; isBreak and isContinue type guards; breakValue and continueValue to an Option; breakOk and continueOk to a Result; mapBreak and mapContinue; and intoValue for a ControlFlow<T, T> alone (in main, a method whose this parameter is that shape) (#79)
