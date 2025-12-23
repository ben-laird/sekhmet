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
# Format and lint with Biome
deno run npm:@biomejs/biome check --write .

# Run all CI checks (format, lint, test, type check)
deno task ci
```

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

### Core Design Principles

1. **Primitive-driven development**: Start with simple primitives that compose
   into complex systems
2. **Zero external dependencies**: Only uses Deno standard library (`@std/*`)
   and internal monorepo code
3. **Tree-shakable architecture**: Each package provides both `main` (kitchen
   sink) and `mini` (granular) export paths
4. **Environment-agnostic**: Code runs in any JavaScript runtime (Deno, Node,
   browser)
5. **ESM-native**: Exclusively uses ES modules

### Package Structure Pattern

Every package follows this dual-export structure:

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

**Export path convention**:

- `@sekhmet/package` → full kitchen sink
- `@sekhmet/package/feature` → full feature exports
- `@sekhmet/package/feature/mini` → tree-shakable feature exports
- `@sekhmet/package/feature/mini/function` → individual functions

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

**Scopes**: Use package names like `@sekhmet/enum`, `@sekhmet/primordials`

## Adding New Features

When adding new functionality to a package:

1. **Add to `mini/` first**: Create the individual export in
   `src/feature/mini/function.ts`
2. **Export from `mini/mod.ts`**: Re-export from the mini barrel file
3. **Export from `main/mod.ts`**: Re-export in the main barrel file
4. **Update package `deno.json`**: Add explicit export path if it's a new mini
   entry point
5. **Write tests**: Place `function.test.ts` next to `function.ts`
6. **Document**: Add JSDoc comments to all exported functions and types

## Working with Enums

The `@sekhmet/enum` package is central to the architecture:

- Use `Enum<T>` where `T` is a variant tuple type
- Variants are `[kind: string]` or `[kind: string, value: unknown]`
- Use `Isolate<T, K>` to extract a specific variant by kind
- Use `Eliminate<T, K>` to exclude a specific variant by kind
- Functions like `exit()`, `eliminate()`, `isolate()` operate on enums

Example variant definition:

```typescript
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
- Follow BDD principles: Given-When-Then structure in tests
