# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-28

### Added

- Add PanicBoundary, the runtime narrowed to catchUnwind and resumeUnwind, and Outcome's fromCaught, which flattens a caught Result (#114)

### Changed

- **BREAKING** One catchUnwind(fn) for sync and async work, returning a Vow<Outcome<T, never, unknown>>: sync work settles it before the call returns, a returned thenable is adopted (its rejection is Panicked), and dependents of an async vow run inside the boundary. catchUnwindAsync is removed. A hook that throws on async work no longer rejects a promise: the vow settles as Panicked and the Panic (PanicHook) escapes as an unhandled rejection. Panic now depends on @sekhmet/vow (#114)

### Fixed

- A thenable that rejects synchronously inside its then call, under a hook that throws, no longer loses the Panic (PanicHook): it escapes catchUnwind, as when then itself throws (#114)
- A throwing dependent of an async catchUnwind vow is reported throw by throw, not as the vow's AggregateError, so a dependent that unwraps a Panicked no longer reports its payload twice (#114, #105)
- catchUnwind reads a returned thenable's then once and calls it with Reflect.apply, as await does, instead of reading it again to adopt it (#114)

## [0.2.0] - 2026-11-20

### Added

- Add Outcome<T, E, P> (Ok/Err/Panicked) at @sekhmet/panic/outcome, keeping a thrown bug apart from an expected error: the ordinary combinators pass a panic through untouched, and the panic channel has isPanicAnd, mapPanic, recover and resume (#86)

### Changed

- **BREAKING** catchUnwind and catchUnwindAsync return Outcome<T, never, unknown> (Ok or Panicked) instead of Result<T, unknown>; recover turns a caught panic into an app error, and panicResult gives the old Result (#86)

## [0.1.2] - 2026-11-18

### Fixed

- Restructure the docs along Diátaxis (tutorial, how-to guides, concepts) and move the Rust std::panic mapping into the module docs

## [0.1.1] - 2026-11-16

### Fixed

- defaultPanicHook prints the same 'panicked: Name: message' header on every engine (V8, Bun, Firefox, WebKit), followed by the stack frames
- Generate IDs with crypto.getRandomValues instead of crypto.randomUUID, so fork() and panics work on plain-HTTP browser pages
