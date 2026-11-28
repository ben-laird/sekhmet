# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-28

### Changed

- **BREAKING** Remove CatchUnwind: new DispatchController({ panics }), DispatchSignal.dispatched({ value, panics }) and DispatchSignal.fromAbortSignal({ signal, panics }) take @sekhmet/panic's PanicBoundary, the runtime itself, instead of runtime.catchUnwind (#114)
- **BREAKING** DispatchSignal.dispatched({ value }) takes no panic runtime: its listeners run at once inside the whenDispatched call that adds them, so a listener that throws now propagates to that caller instead of being caught and reported (#114)

## [0.2.0] - 2026-11-20

### Changed

- **BREAKING** CatchUnwind, the boundary a DispatchController runs its listeners in, is @sekhmet/panic's new catchUnwind, which returns an Outcome instead of a Result (#86)
