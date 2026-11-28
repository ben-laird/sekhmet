# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-28

### Changed

- **BREAKING** Remove LifetimePanics: Lifetime and Resource.start take @sekhmet/panic's PanicBoundary. On an async double fault a cleanup or init now fails with its own panic, and the Panic (PanicHook) escapes as an unhandled rejection, instead of becoming the failure (#114)
- **BREAKING** Resource.start settles a Vow<Outcome<Lifetime<T, C>, never, unknown>>: Ok(lifetime), or Panicked(payload) when init panicked, in place of Result<Lifetime<T, C>, Panic<unknown>>. Read it with @sekhmet/panic/outcome's isPanicked, unwrapPanicked and unwrap, which throws the payload again (#114)

### Fixed

- The panic hook now reports init's Panic (InitFailed) wrapper, with the original payload as its cause, instead of the raw payload; the SetupTeardownFailed carrier is recorded as reported without reaching the hook. Unwrapping start's Panicked into an outer boundary of the same runtime no longer reports it again (#114)

## [0.2.0] - 2026-11-20

### Changed

- **BREAKING** LifetimePanics takes @sekhmet/panic's new catchUnwind and catchUnwindAsync, which return an Outcome instead of a Result (#86)
