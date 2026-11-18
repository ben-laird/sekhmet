# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-11-18

### Fixed

- Document each helper's message format, rendering and option fallbacks in the API docs, and restructure the guides along Diátaxis

## [0.2.0] - 2026-11-17

### Added

- Add invariantEqual, Rust's assert_eq!: panics as Panic (Invariant) showing both values when actual and expected differ by Object.is or a custom equals
- Add defined and satisfies: invariant checks that return the value narrowed (defined removes null, undefined or both, never testing truthiness; satisfies narrows by a type guard) and panic as Panic (Invariant)

### Changed

- **BREAKING** InvariantCause records which check failed as a check field discriminated by kind; invariant's falsy condition moves to cause.check.condition
