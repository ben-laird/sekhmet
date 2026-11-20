# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-20

### Changed

- **BREAKING** parse(schema, { input, panics }) runs under a panic runtime and returns Vow<Outcome<O, E, unknown>>: a throw or rejection in user code is Panicked, an expected failure Err. Potential (Sync, Async, from, mapPotential, PotentialVariants) and parseAsync are removed (use wait(parse(…))); a schema holds a Runner (SchemaParams.run; new Schema({ parse }) or { run }); toStandard takes panics (#84)

## [0.1.1] - 2026-11-18

### Fixed

- Add a module doc to every entrypoint, so each one is documented on JSR
