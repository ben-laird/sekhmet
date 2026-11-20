# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-20

### Changed

- **BREAKING** Rename JobOutcome to JobEnd and JobOutcomeVariants to JobEndVariants, and move the @sekhmet/job/outcome export paths to @sekhmet/job/end, freeing "Outcome" for @sekhmet/panic's Outcome; the types Outcomes, NeedOutcomes and OutcomeView become JobEnds, NeedEnds and EndView, while the report.outcomes, outcomes and view.outcome fields keep their names (#87)

## [0.2.0] - 2026-11-19

### Added

- Make meta optional when the metadata accepts undefined
