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
# - Publish readiness: README/LICENSE, exports, no external imports,
#   tests excluded from publish, Given/When/Then comments, README/JSDoc
#   import specifiers (known failures: scripts/ci/src/readiness/allowlisted.ts)
# - JSR publish dry run
# - All tests, with coverage (CI: a per-package table on the GitHub job
#   summary; AI mode: totals in the "Coverage Summary" step outputs)

# For manual formatting only:
deno run npm:@biomejs/biome check --write .
```

**IMPORTANT**: After implementing any feature, fix, or refactor, you MUST run
`CI_AI=true deno task ci` to verify your work passes all checks before
considering the task complete.

**AI Mode (`CI_AI=true`)**: Always use the `CI_AI=true` environment variable
when running CI as an AI agent. This mode:

- Allows dirty worktree (JSR publish dry-run won't fail on uncommitted changes)
- Outputs structured JSON for programmatic parsing

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
- `@sekhmet/panic`: `Panic` error, `panic()`/`panicWithoutCause()`, panic hooks
  and a metadata registry
- `@sekhmet/primordials`: foundation primitives (`Struct`, `Subtle`, `block`,
  `define`)
- `@sekhmet/vow`: `Vow`, a synchronous promise-like value built on `Enum`

Scripts (`scripts/`, unpublished):

- `@sekhmet/add`: scaffolds a new workspace from `scripts/add/templates/`
  (`deno task add`)
- `@sekhmet/ci`: runs lint, type check, doc lint, publish readiness, JSR dry run and tests (`deno task ci`)

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
`@sekhmet/matrix`, `@sekhmet/panic`, `@sekhmet/primordials`, `@sekhmet/vow`,
and `@sekhmet/add`, `@sekhmet/ci` for scripts

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
