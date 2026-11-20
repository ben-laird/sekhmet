# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

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
