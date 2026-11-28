# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-28

### Changed

- **BREAKING** parseSync(schema, { input, panics }) and is(schema, { panics }) take a required panic runtime, like parse; main's method is schema.parseSync({ input, panics }). A throw while parseSync runs still unwinds to its caller, but what is left of an abandoned async parse now runs under panics: a panic there is reported once and settles Panicked, instead of being caught unreported (#114)
- **BREAKING** Remove schema's own PanicBoundary type: ParseOptions and toStandard take @sekhmet/panic's PanicBoundary (catchUnwind and resumeUnwind). Pass the panic runtime as before. In an async parse, a hook that throws now settles the parse as Panicked, and its failure escapes as an unhandled rejection (#114)

### Fixed

- toStandard's validate no longer catches, reports and resumes a panic in toIssue: toIssue runs where validate's caller waits, so its throw propagates out of validate unreported, for the caller's own boundary. A panic in the parse is still reported and resumed (#114)

## [0.2.0] - 2026-11-20

### Changed

- **BREAKING** parse(schema, { input, panics }) runs under a panic runtime and returns Vow<Outcome<O, E, unknown>>: a throw or rejection in user code is Panicked, an expected failure Err. Potential (Sync, Async, from, mapPotential, PotentialVariants) and parseAsync are removed (use wait(parse(…))); a schema holds a Runner (SchemaParams.run; new Schema({ parse }) or { run }); toStandard takes panics (#84)

## [0.1.1] - 2026-11-18

### Fixed

- Add a module doc to every entrypoint, so each one is documented on JSR
