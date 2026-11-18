# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Essential Commands

### Running Tests

```bash
# Run all tests
deno test --no-prompt --parallel

# Run tests with coverage analysis
deno task gaps

# Run tests for specific package
deno test packages/enum/

# Run a single test file
deno test packages/enum/src/core/mini/eliminate.test.ts
```

### Code Quality

```bash
# **ALWAYS run this after making changes to verify your work**
CI_AI=true deno task ci

# This runs ALL quality checks:
# - Format and lint with Biome, and deno lint
# - Type checking
# - Documentation lint per package, over its export set
# - Publish readiness: README/LICENSE, exports, a @module doc on every
#   published entrypoint, a code example in every published README, no
#   external imports, tests excluded from publish, Given/When/Then
#   comments, README/JSDoc import specifiers, no module-level mutable
#   state in schema source, no todo from @sekhmet/workflow in package
#   source (known failures: scripts/ci/src/readiness/allowlisted.ts)
# - JSR publish dry run (fails on slow types)
# - All tests, with coverage (CI: a per-package table on the GitHub job
#   summary; AI mode: totals in the "Coverage Summary" step outputs)

# For manual formatting only (the pinned Biome from deno.json):
deno task fmt
```

**IMPORTANT**: After implementing any feature, fix, or refactor, you MUST run
`CI_AI=true deno task ci` to verify your work passes all checks before
considering the task complete.

**Commit gate**: with the hooks on (`deno task hooks`, which installs shims in
the shared `.git/hooks/` and unsets `core.hooksPath`), each worktree's
`.githooks/pre-commit` refuses a commit whose staged tree has no green
`deno task ci` run (markdown-only commits are exempt unless they touch a code
block `deno test --doc` runs). Stage first, run the gate, then commit; never
bypass it with `--no-verify`, and never set `core.hooksPath` (it disables the
shims). See CONTRIBUTING.md, "Commit gate".

**AI Mode (`CI_AI=true`)**: Always use the `CI_AI=true` environment variable
when running CI as an AI agent. This mode outputs structured JSON for
programmatic parsing. Every local run (AI or not) allows a dirty worktree: the
JSR publish dry run passes `--allow-dirty`, so staged changes can be gated
before they are committed; only CI (`CI=true`) requires a clean tree.

**Handling CI Failures**: If CI fails:

- **Analyze the failure**: Test failures, type errors, or lint issues may reveal
  bugs in your implementation OR in existing code
- **Don't assume you're wrong**: CI failures might catch mistakes in the
  original codebase that your changes exposed
- **Fix the root cause**: Whether it's your new code or a pre-existing bug,
  address the actual issue rather than working around it
- **Communicate findings**: If CI reveals issues in existing code, explain what
  you found and what you're fixing

### Package Management

```bash
# Add a new workspace/package
deno task add
```

## Architecture Overview

### Monorepo Structure

This is a **Deno workspace monorepo** for the Sekhmet TypeScript framework
collection. The workspace is defined in the root `deno.json` with packages under
`packages/` and build tools under `scripts/`.

Packages (`packages/`):

- `@sekhmet/effect`: effect system (effects, fibers, continuations, runtime,
  scheduler)
- `@sekhmet/enum`: enum framework plus `option`, `result`, `latch`, `poll` and
  `ordering` built on it
- `@sekhmet/matrix`: `matrix()` builds the Cartesian product of value arrays for
  parameterized tests
- `@sekhmet/panic`: `Panic` error, `panic()`/`panicWithoutCause()`, a Rust-style
  panic runtime (`definePanicRuntime()`: a reporting hook plus `catchUnwind`
  boundaries, no global state) and a metadata registry
- `@sekhmet/primordials`: foundation primitives (`Struct`, `Subtle`, `block`,
  `define`)
- `@sekhmet/schema`: typed validation and transformation (`Schema<I, O, E>`
  parses to a `Result`), with primitives, composites, an algebra (`or`,
  `brand`, `readonly`, shape reshapers), a Standard Schema bridge, and its
  structure and annotations carried as data
- `@sekhmet/vow`: `Vow`, a synchronous promise-like value built on `Enum`
- `@sekhmet/workflow`: workflow helpers that panic through `@sekhmet/panic`:
  `todo`/`unimplemented`, `unreachable` (compile-time exhaustiveness) and
  the invariant checks `invariant`, `invariantEqual`, `defined` and
  `satisfies`, each with a typed cause and an `is…Panic` guard

Scripts (`scripts/`, unpublished):

- `@sekhmet/add`: scaffolds a new workspace from `scripts/add/templates/`
  (`deno task add`)
- `@sekhmet/ci`: runs lint, type check, doc lint, publish readiness, JSR dry run and tests (`deno task ci`)
- `@sekhmet/compat`: runs every package's unit tests on a non-Deno runtime
  (`deno task compat:test <node|bun|chromium|firefox|webkit|workerd>`) through
  a bundled `Deno.test` shim; not part of `deno task ci` (see
  `scripts/compat/README.md`)
- `@sekhmet/compat-smoke`: installs the published packages from JSR on Node,
  Bun, Chromium, Firefox, WebKit or workerd and imports and exercises every
  export path (`deno task compat:smoke <runtime>`; run by
  `.github/workflows/compat-smoke.yml`, never by `deno task ci`)
- `@sekhmet/docs-site`: the VitePress docs site; assembles the root README and
  every package's `README.md` and `docs/*.md` into a sidebar per package,
  grouped by each page's Diátaxis `kind` frontmatter (see CONTRIBUTING.md,
  "Documenting your change") (`deno task docs:dev`, `deno task docs:build`; deployed to GitHub Pages by
  `.github/workflows/docs.yml`)
- `@sekhmet/dv`: the pinned dv release CLI, run frozen (`deno task dv <args>`,
  e.g. `deno task dv add`, `deno task dv status`)
- `@sekhmet/dv-plugin`: the dv plugin that versions and publishes `packages/*`
  to JSR
- `@sekhmet/gen-main`: generates each feature's main (method-chaining)
  `main/mod.ts` from its mini barrel (`deno task gen:main`; `--check` in CI)
- `@sekhmet/playground`: `deno task play:notebook` starts a Jupyter notebook
  in the gitignored `playground/`, and `deno task play:link <target>` links
  `playground/` to a worktree's (or any checkout's) packages for the editor
  (see CONTRIBUTING.md, "Playground")
- `@sekhmet/release`: the release driver `.github/workflows/release.yml` runs
  on every push to main: versions pending Records, tags, publishes, and opens
  GitHub Releases

### Core Design Principles

1. **Primitive-driven development**: Start with simple primitives that compose
   into complex systems
2. **Zero external dependencies**: Only uses Deno standard library (`@std/*`)
   and internal monorepo code
3. **Tree-shakable architecture**: Packages use `main`/`mini` export paths for
   large features; small features use a flat structure (see [patterns.md](patterns.md))
4. **Environment-agnostic**: Code runs in any JavaScript runtime (Deno, Node,
   browser)
5. **ESM-native**: Exclusively uses ES modules

### Package Structure Pattern

Large features use a dual-export `main`/`mini` structure. Small features (one or
two files) use a flat structure with no split. See [patterns.md](patterns.md) for
the full decision guide.

**Large feature (main/mini split):**

```txt
package-name/
├── src/
│   ├── core/
│   │   ├── main/mod.ts    # Full-featured "kitchen sink" exports
│   │   └── mini/          # Tree-shakable individual exports
│   │       ├── mod.ts     # Collects all mini exports
│   │       └── feature.ts # Individual feature export
│   ├── feature1/
│   │   ├── main/mod.ts
│   │   └── mini/
│   └── feature2/
├── deno.json              # Package config with dual export paths
└── mod.ts                 # Top-level re-export
```

**Small feature (flat, no split):**

```txt
package-name/
├── src/
│   └── feature/
│       ├── mod.ts          # Single barrel re-export
│       └── feature.ts      # Implementation
├── deno.json
└── mod.ts
```

**Export path convention**:

- `@sekhmet/package` → full kitchen sink, only where features don't collide
  (enum and primordials have no root export; import a feature subpath)
- `@sekhmet/package/feature` → full feature exports (main/mini or flat)
- `@sekhmet/package/feature/mini` → tree-shakable feature exports (main/mini only)
- `@sekhmet/package/feature/mini/function` → individual functions (main/mini only)

### Key Primitives

**`@sekhmet/primordials`**: Foundation primitives used throughout the monorepo

- `Struct<T>`: Provides semi-private field access via symbol-based
  encapsulation. Used extensively for creating type-safe wrappers (mimics Rust
  structs).
- `getStructParams<T>()`: Extracts the encapsulated value from a `Struct<T>`.

**`@sekhmet/enum`**: Type-safe enum framework

- Built on `Struct` from primordials
- Represents a collection of variants without unions
- Variants are tuples: `[kind: K]` or `[kind: K, value: V]`
- Key types: `Enum<T>`, `Isolate<T, K>`, `Eliminate<T, K>`, `Split<T>`

### Path Aliases

- `@~/`: Repository root (globally available)
- `@/`: Package-local root (within each package's `deno.json`)

## TypeScript Configuration

This codebase uses **maximum TypeScript strictness**:

```json
{
	"strict": true,
	"exactOptionalPropertyTypes": true,
	"useUnknownInCatchVariables": true,
	"noImplicitOverride": true,
	"noUncheckedIndexedAccess": true,
	"isolatedDeclarations": true
}
```

**Critical**: All code MUST compile with `isolatedDeclarations: true`. This
means:

- All exported functions need explicit return types
- All exported variables need explicit type annotations
- No inferred types on public API boundaries

## Code Style

- **Indentation**: Tabs (configured in Biome and `deno.json`)
- **Quotes**: Double quotes for strings
- **Naming**:
  - `camelCase` for variables and functions
  - `PascalCase` for types and interfaces
  - `SCREAMING_SNAKE_CASE` for constants
- **Prefer functions over classes** except when needed (like `Struct` or `Enum`)
- **Pure functions over stateful logic**

## Branches and Pull Requests

Sekhmet follows GitHub Flow. `main` is protected by a ruleset: never push to
it, not even a fast-forward. Every change lands through a pull request,
merged by squash or rebase (no merge commits), once these required checks
pass: `ci`, `validate` (dv-validate) and the seven compat `suite (…)` jobs.
The only direct pusher is the release workflow, which pushes the
`chore(release):` commit and tags with the `DV_PAT` secret. See
CONTRIBUTING.md, "Pull Request Process".

## Commit Convention

Follow **Conventional Commits** with package scopes:

```txt
type(scope): description

feat(@sekhmet/enum): add eliminate function
test(@sekhmet/enum): add exit tests
chore(@sekhmet/enum): add eliminate mini exports
fix(@sekhmet/primordials): correct Struct type inference
```

**Types**: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `perf`

**Scopes**: Use package names: `@sekhmet/effect`, `@sekhmet/enum`,
`@sekhmet/matrix`, `@sekhmet/panic`, `@sekhmet/primordials`, `@sekhmet/schema`,
`@sekhmet/vow`, `@sekhmet/workflow`, and `@sekhmet/add`, `@sekhmet/ci`, `@sekhmet/compat`, `@sekhmet/compat-smoke`,
`@sekhmet/dv`, `@sekhmet/dv-plugin`, `@sekhmet/gen-main`, `@sekhmet/playground`,
`@sekhmet/release` for scripts

## Infrastructure Code Conventions

Code in `scripts/`, CI configuration, and other infrastructure has **relaxed
conventions** compared to published packages:

- **No package structure requirements**: Infrastructure code doesn't need to
  follow the `main/`/`mini/` pattern
- **No export conventions**: Scripts don't need dual export paths or specific
  export patterns
- **Backwards compatibility not required**: Breaking changes to internal tooling
  are acceptable
- **Pragmatic over pure**: Use classes, state, or any patterns that make the
  tool easier to maintain
- **Dependencies allowed**: Infrastructure can use external dependencies if they
  improve maintainability
- **TypeScript strictness still applies**: Infrastructure must still compile
  with the global strict TypeScript settings (including `isolatedDeclarations`),
  but the architectural constraints and API design principles for packages don't
  apply

**Still required for infrastructure**:

- Pass `deno task ci` checks (formatting, linting, tests)
- Clear code that future maintainers can understand
- Tests for complex logic
- Conventional commit messages

Infrastructure exists to support package development—optimize for
maintainability and developer experience over architectural purity.

## Adding New Features

When adding new functionality to a package, first decide the structure (see
[patterns.md](patterns.md) — "When to use main/mini split vs. flat structure").

**For features using a main/mini split:**

1. **Add to `mini/` first**: Create the individual export in
   `src/feature/mini/function.ts`
2. **Export from `mini/mod.ts`**: Re-export from the mini barrel file
3. **Regenerate main**: Run `deno task gen:main` (main is generated from mini;
   never edit a generated `main/mod.ts`) and commit it with the mini change
4. **Update package `deno.json`**: Add explicit export path if it's a new mini
   entry point
5. **Write tests**: Place `function.test.ts` next to `function.ts`
6. **Document**: Add JSDoc comments to all exported functions and types

**For flat features (no main/mini split):**

1. **Create `src/feature/feature.ts`**: Implementation file at the feature root
2. **Create `src/feature/mod.ts`**: Barrel re-exporting from the implementation
3. **Update package `deno.json`**: Add `./feature` and `./feature/feature` export paths
4. **Write tests**: Place `feature.test.ts` next to `feature.ts`
5. **Document**: Add JSDoc comments to all exported functions and types

## Working with Enums

The `@sekhmet/enum` package is central to the architecture:

- Use `Enum<T>` where `T` is a variant tuple type
- Variants are `[kind: string]` or `[kind: string, value: unknown]`
- Use `Isolate<T, K>` to extract a specific variant by kind
- Use `Eliminate<T, K>` to exclude a specific variant by kind
- Functions like `exit()`, `eliminate()`, `isolate()` operate on enums

Example variant definition:

```ts ignore
type MyVariants =
	| [kind: "success", value: string]
	| [kind: "error", value: Error]
	| [kind: "pending"];
```

## Testing Guidelines

- Place tests next to source: `feature.ts` → `feature.test.ts`
- Use `@std/assert` for assertions
- Import from source using `@/` alias within packages
- Test file naming: `*.test.ts`
- **REQUIRED**: Use Given-When-Then comments in ALL tests to document the test
  structure

### Given-When-Then Structure

Every test MUST include explicit Given-When-Then comments:

```ts ignore
Deno.test("feature does something", () => {
	// Given: initial state or setup
	const input = createInput();

	// When: action being tested
	const result = feature(input);

	// Then: expected outcome
	assertEquals(result, expected);
});
```

**Guidelines**:

- **Given**: Describe the preconditions and test setup
- **When**: Describe the action or operation being tested
- **Then**: Describe the expected result or behavior
- Use these comments even in simple tests for consistency
- Multiple When-Then pairs are acceptable for complex scenarios
- `deno task ci` enforces them on every `Deno.test` and `t.step`; a marker
  covers its block and the steps nested in it (see CONTRIBUTING.md)

## Additional Resources

This directory contains additional reference material for common patterns and
templates:

- **[patterns.md](.claude/patterns.md)**: Detailed implementation patterns
  including enum narrowing, pattern matching, struct encapsulation, type
  utilities, error handling, composition patterns, and when to use main/mini
  split vs. flat feature structure
- **[templates.md](.claude/templates.md)**: Quick-reference code templates for
  new features, BDD tests, enum variants, Struct wrappers, JSDoc comments, and
  package structures
- **[CONTRIBUTING.md](CONTRIBUTING.md)**: Contributor-facing guide covering
  package structure tiers, coding standards, testing, and PR process

These files provide concrete examples and can be consulted when implementing
specific features or following established patterns in the codebase.
