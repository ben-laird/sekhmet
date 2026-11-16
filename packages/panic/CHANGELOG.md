# Changelog

All notable changes to this Package are documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this Package adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-11-16

### Fixed

- defaultPanicHook prints the same 'panicked: Name: message' header on every engine (V8, Bun, Firefox, WebKit), followed by the stack frames
- Generate IDs with crypto.getRandomValues instead of crypto.randomUUID, so fork() and panics work on plain-HTTP browser pages
