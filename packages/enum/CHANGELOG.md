# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-11-28

### Added

- Poll's expectReady(poll, message) unwraps a Ready and throws the message on Pending, like Option's expect (#114)

## [0.5.0] - 2026-11-20

### Added

- Add Either<L, R> (Left/Right) at @sekhmet/enum/either, ported from Rust's either crate (#85)

## [0.4.0] - 2026-11-20

### Added

- ControlFlow: Rust's std::ops::ControlFlow at @sekhmet/enum/control-flow (main) and @sekhmet/enum/control-flow/mini. Continue(value) and Break(value) constructors, with ControlFlow<B, C = undefined>; isBreak and isContinue type guards; breakValue and continueValue to an Option; breakOk and continueOk to a Result; mapBreak and mapContinue; and intoValue for a ControlFlow<T, T> alone (in main, a method whose this parameter is that shape) (#79)

## [0.3.0] - 2026-11-20

### Changed

- **BREAKING** Receiver-constrained methods, as in Rust: main Option's flatten, transpose and unzip are methods whose this parameter is the receiver shape they need (Option<Option<T>>, Option<Result<T, E>>, Option<[T, U]>), replacing main's standalone flatten, transpose and unzip with no aliases (mini keeps its functions). New: Result.transpose for Result<Option<T>, E>, Result.flatten for Result<Result<T, E>, E>, and Poll.mapOk/mapErr for Poll<Result<T, E>>, each in mini and main; main Poll converts a returned Result to a main Result (#72)

## [0.2.0] - 2026-11-17

### Added

- Add maybe to build an Option from a nullable value, fallible and fallibleAsync to capture a function's throws as a Result, and promiseResult to build a promised Result from a Promise-style executor
