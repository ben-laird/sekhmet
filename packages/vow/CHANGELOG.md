# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-11-28

### Added

- poll(vow) reads a vow's state now as a Poll: Ready(value) once resolved, Pending() otherwise (#114)

### Changed

- **BREAKING** Remove fromPromise and FromPromiseOptions: vow no longer depends on @sekhmet/panic. Bridge a promise with a panic runtime's catchUnwind(() => promise) instead, whose rejection is Panicked; classify an expected failure with promise.then(Ok, Err) and flatten it with fromCaught (#114)

## [0.4.0] - 2026-11-20

### Added

- all(vows) joins any number of vows into a vow of every value, in order: the n-ary zip, resolving inside the call when every input already has (#84)

## [0.3.0] - 2026-11-20

### Changed

- **BREAKING** fromPromise's panics is @sekhmet/panic's new PanicRuntime, whose catchUnwind returns an Outcome instead of a Result (#86)

## [0.2.0] - 2026-11-20

### Added

- Add andThen, which chains a step that returns a Vow and stays synchronous when every step is, and a synchronous read of a vow's state: value (Some(value) once resolved, None while pending) and the type guards isResolved and isPending

### Changed

- **BREAKING** fromPromise takes { promise, panics } and resolves its vow inside panics.catchUnwind, so a dependent that throws is reported through the panic runtime's hook instead of escaping as an unhandled rejection (#59)
- **BREAKING** Make Vow covariant in T (Vow<out T>): Pending now holds a subscribe function instead of the array of dependents, so code that matched on Pending's deps gets subscribe
