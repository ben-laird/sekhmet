# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-20

### Changed

- **BREAKING** Receiver-constrained methods, as in Rust: main Option's flatten, transpose and unzip are methods whose this parameter is the receiver shape they need (Option<Option<T>>, Option<Result<T, E>>, Option<[T, U]>), replacing main's standalone flatten, transpose and unzip with no aliases (mini keeps its functions). New: Result.transpose for Result<Option<T>, E>, Result.flatten for Result<Result<T, E>, E>, and Poll.mapOk/mapErr for Poll<Result<T, E>>, each in mini and main; main Poll converts a returned Result to a main Result (#72)

## [0.2.0] - 2026-11-17

### Added

- Add maybe to build an Option from a nullable value, fallible and fallibleAsync to capture a function's throws as a Result, and promiseResult to build a promised Result from a Promise-style executor
