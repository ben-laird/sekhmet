# Contributing to Sekhmet

Thank you for your interest in contributing to Sekhmet! This guide will help you
get started and understand the project conventions.

## Table of Contents

- [Standards & Conventions](#standards--conventions)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Releasing](#releasing)
- [Adding New Packages](#adding-new-packages)

## Standards & Conventions

This project follows established industry standards and conventions:

### Version Control & Releases

- **[Conventional Commits](https://www.conventionalcommits.org/)** - Structured
  commit messages for clear history and automated changelog generation
- **[Semantic Versioning](https://semver.org/)** - Version numbering scheme
  (MAJOR.MINOR.PATCH)
- **[dv](https://jsr.io/@dv-cli/dv)** - Records drive versions, changelogs and
  JSR releases (see [Releasing](#releasing))

### Code Quality

- **[Biome](https://biomejs.dev/)** - Fast formatter and linter for JavaScript
  and TypeScript
  - Configured in [biome.json](biome.json)
  - Enforces consistent formatting and code quality rules
- **[TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)** -
  Maximum type safety with additional strict compiler options
- **[isolatedDeclarations](https://www.typescriptlang.org/tsconfig#isolatedDeclarations)** -
  Explicit type annotations for better compatibility

### Documentation

- **[JSDoc](https://jsdoc.app/)** - Inline code documentation for functions and
  types
- **[Markdown](https://commonmark.org/)** - CommonMark specification for all
  documentation files

### Module System

- **[ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)** -
  Native JavaScript module system (ESM)
- **[Deno Workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/)** -
  Monorepo management

### Testing Framework

- **[Deno Test](https://docs.deno.com/runtime/fundamentals/testing/)** -
  Built-in test runner with coverage support
- **[Behavior-Driven Development (BDD)](https://en.wikipedia.org/wiki/Behavior-driven_development)** -
  Tests use Given-When-Then structure for clarity

All contributions must adhere to these standards. The CI pipeline aims to
enforce compliance automatically.

## Getting Started

Sekhmet is a collection of frameworks for type-safe, composable development.
Before contributing:

1. Read the main [README.md](README.md) to understand the project philosophy
2. Explore existing packages to understand the patterns
3. Check open issues for tasks that need help

## Development Setup

### Prerequisites

- [Deno](https://deno.land/) (latest version recommended)
- Git

### Initial Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/sekhmet.git
   cd sekhmet
   ```

2. The project uses Deno workspaces. All dependencies are managed through
   [deno.json](deno.json).

3. Run CI checks to ensure everything works:

   ```bash
   deno task ci
   ```

### Playground

`playground/` at the repository root is gitignored and never checked by
`deno task ci`, so keep scratch scripts and notebooks there. Your editor still
covers it: the Deno language server (hovers, completions, type errors) and
Biome (formatting, lint, organize imports) both see the folder. Imports of
`@sekhmet/*` resolve to the checked-out source, so you are always playing with
the current branch:

```bash
deno run playground/try.ts         # any script that imports @sekhmet/*
deno check playground/try.ts       # type-check it
deno task fmt playground/          # format and lint-fix it with Biome
```

The gate stays off it in three ways: Biome and `deno check` run over the files
git does not ignore (`scripts/ci/gate-files.ts`), `deno lint` and `deno test`
exclude it in `deno.json` (`lint.exclude`, `test.exclude`), and the
publish-readiness scans skip it. `deno.json`'s `lint.exclude` also turns off
Deno's lint diagnostics for it in the editor; Biome's lint still runs there.

- **`deno task play`** opens `deno repl` with every package's public features
  imported as globals and prints a table of what loaded. It reads each
  `packages/*/deno.json` at startup, so packages that exist only on your branch
  show up too. A package with a root export is one namespace named after the
  package (`effect`, `vow`); one without exposes each main (method-chaining)
  feature (`option`, `result`); `mini` entrypoints are skipped, and a name two
  packages share is qualified (`enumCore`). A feature that fails to import is
  listed as a warning and the REPL still opens.

  ```ts ignore
  > option.Some(2).map((n) => n * 21).unwrap()
  42
  ```

- **`deno task play:notebook`** copies a starter notebook to
  `playground/start.ipynb` (it never overwrites yours). Open it in VS Code with
  the Jupyter extension and pick the Deno kernel; if the kernel isn't listed,
  run `deno jupyter --install` once.

#### Using your checkout from another Deno project

To try the packages in another Deno project, point its `deno.json` `links` at
your checkout. The `imports` keep their `jsr:` specifiers; `links` overrides
them with the local source, and works for unpublished packages too:

```json
{
	"imports": {
		"@sekhmet/schema": "jsr:@sekhmet/schema@^0.1.0"
	},
	"links": [
		"../sekhmet/packages/schema",
		"../sekhmet/packages/enum",
		"../sekhmet/packages/primordials"
	]
}
```

- **Link every sibling a linked package depends on**, or its `@sekhmet/*`
  imports go to JSR instead: `schema` needs `enum` and `primordials`.
- **Links follow your checkout's current branch.** Switching branches in the
  sekhmet repo changes what the other project runs.

## Project Structure

```txt
sekhmet/
├── packages/         # Framework packages
│   ├── effect/       # Effect system (effects, fibers, runtime, scheduler)
│   ├── enum/         # Enum framework (core, option, result, latch, poll, ordering)
│   ├── matrix/       # Cartesian-product test case generation
│   ├── panic/        # Panic errors and the panic runtime (hook, catchUnwind)
│   ├── primordials/  # Core primitives (Struct, Subtle, scoping helpers)
│   └── vow/          # Synchronous promise-like values
├── scripts/          # Build and development scripts
│   ├── add/          # Package scaffolding tool (deno task add)
│   ├── ci/           # CI workflow runner (deno task ci)
│   ├── dv-plugin/    # dv plugin: versions and publishes packages/* to JSR
│   └── release/      # Release driver run by .github/workflows/release.yml
├── .dv/              # dv config and pending Records
├── deno.json         # Workspace configuration
├── biome.json        # Linter/formatter config
├── LICENSE.md        # MIT license
└── README.md
```

### Package Structure

Each big package (any package with multiple feature exports and large classes)
follows this structure. Large features use a `main/`/`mini/` split; small
features (one or two files) use a flat structure with just a `mod.ts`:

```txt
package-name/
├── src/
│   ├── large-feature/
│   │   ├── main/        # Full-featured exports (large features only)
│   │   └── mini/        # Tree-shakable minimal exports (large features only)
│   ├── small-feature/
│   │   ├── mod.ts       # Flat barrel (small features — no main/mini split)
│   │   └── feature.ts   # Implementation
│   └── ...
├── deno.json            # Package configuration
└── README.md
```

Medium-sized packages (any package with multiple feature exports) follow this
structure:

```txt
package-name/
├── src/
│   ├── feature-name/
│   │   ├── mod.ts       # Exports
│   │   ├── mod.test.ts  # Tests
│   │   └── ...
│   └── ...
├── deno.json            # Package configuration
└── README.md
```

Small packages will follow this structure:

```txt
package-name/
├── mod.ts               # Exports
├── mod.test.ts          # Tests
├── deno.json            # Package configuration
└── README.md
```

When in doubt, start with a small package, and start writing code in a
`mod.test.ts` file right next to your tests. Soon, you'll get a big enough file
that your main code you can move to a `mod.ts` file, and your tests will already
be written for you!

If you have multiple related `mod.ts` files written like this, refactor to the
medium-sized configuration. Then, if you have big enough features, refactor to
the big package configuration.

## Coding Standards

### TypeScript Configuration

We use the strictest TypeScript settings:

- `strict: true`
- `exactOptionalPropertyTypes: true`
- `useUnknownInCatchVariables: true`
- `noImplicitOverride: true`
- `noUncheckedIndexedAccess: true`
- `isolatedDeclarations: true`

All code must compile with these settings.

### Code Style

- **Formatting**: We use tabs for indentation (configured in Biome)
- **Quotes**: Double quotes for strings
- **Imports**: Use path aliases (`@~/` for root, `@/` within packages)
- **Naming**:
  - `camelCase` for variables and functions
  - `PascalCase` for types and interfaces
  - `SCREAMING_SNAKE_CASE` for constants

### Format and Lint

Run Biome (the version pinned in `deno.json`) to format and lint your code:

```bash
deno task fmt
```

Or use your editor's Biome integration.

### Core Principles

1. **Zero external dependencies**: Only use code within this monorepo for source
   code. You may use any dependencies necessary for test code; be sure to check
   the root `deno.json` for all external dependencies included, as you might
   find one that suits your needs already installed.
2. **Environment-agnostic**: Source code should work in all JavaScript runtimes.
   Test code only needs to work in Deno.
3. **Type-safe**: Leverage TypeScript's type system maximally
4. **Composable**: Design primitives that can be combined
5. **Tree-shakable**: Provide `mini` variants with granular exports
6. **ESM-native**: Use ES modules exclusively

### Architecture Patterns

- Start with simple primitives
- Build complex functionality through composition
- Avoid classes when functions suffice
- Prefer pure functions over stateful logic
- Export both "kitchen sink" and individual functions

#### Main is generated from mini

Write the functional API in `mini/`. The method-chaining `main/` API
(`Some(1).map(f).unwrapOr(0)`) is generated from it by `scripts/gen-main`;
generated files start with `// GENERATED by scripts/gen-main — do not edit`.

1. Write or change the mini function, with JSDoc.
2. Run `deno task gen:main`.
3. Commit the mini change and the regenerated `main/mod.ts` files together.

`deno task gen:main --check` fails, listing the stale files, when a checked-in
main module no longer matches its mini source. A new feature opts in with an
entry in `scripts/gen-main/src/config.ts`. A feature with no class of its own
(say, constructors for another feature's class) leaves out `primary`: its main
module re-declares each function returning a `wraps` target so it returns that
target's main class, and re-exports the rest.

Mini functions that operate on a primary class instance name their first
parameter `self`. That is the signal that the function becomes a method on
the main class:

```ts ignore
// mini: free function with self
export function cancel<I, T, E>(self: Fiber<I, T, E>): void { … }

// main (generated): instance method delegating to mini
export class Fiber<I, T, E> extends mini.Fiber<I, T, E> {
  cancel(): void { mini.cancel(this); }
}
```

Functions whose first parameter is typed as a _different_ class (e.g. `fork`
takes `self: Runtime`, not `self: Fiber`) are not methods. When such a
function, or a method, returns the primary type, main returns the main class
(converted with its static `fromMini`), so calls keep chaining. See
[patterns.md](.claude/patterns.md) for the full contract.

A class feature can also take methods from another feature's mini barrel
with `borrows` in its config entry, for a function that belongs to that
feature but reads best chained (`@sekhmet/schema`'s `Schema` takes
`optional`, `nullable` and `array` from composites). A borrowed function
takes `self` first, like any method's, or names the `field` of its single
options object that the receiver fills (`array({ item })` becomes
`.array()`, a method with no arguments). The generated module imports the
barrel as a namespace, and borrowed examples are rewritten to method form.

### Infrastructure Code Conventions

Code in `scripts/`, CI configuration, GitHub Actions workflows, and other
infrastructure has **relaxed conventions** compared to published packages:

**Relaxed for infrastructure:**

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

**Still required for infrastructure:**

- Pass `deno task ci` checks (formatting, linting, tests)
- Clear code that future maintainers can understand
- Tests for complex logic
- Conventional commit messages

Infrastructure exists to support package development; optimize for
maintainability and developer experience over architectural purity.

## Testing

### Writing Tests

- Place tests next to source files: `feature.ts` → `feature.test.ts`
- Use Deno's built-in test runner
- Import from `@std/assert` and `@std/testing` (and other dependencies)
- Follow BDD principles using **Given-When-Then** structure

#### BDD Test Structure

We use Behavior-Driven Development with Given-When-Then comments to make tests
clear and maintainable:

```ts ignore
import { assertEquals } from "@std/assert";
import { myFunction } from "./feature.ts";

Deno.test("myFunction handles basic case", () => {
	// Given: setup test data and preconditions
	const input = "test";

	// When: execute the behavior being tested
	const result = myFunction(input);

	// Then: assert expected outcomes
	assertEquals(result, expected);
});
```

`deno task ci` enforces this (the Publish Readiness step): every `Deno.test`
and every `t.step` must be covered by `// Given:`, `// When:` and `// Then:`
comments (a bare `// Given` also counts, and `// When/Then:` names two). A
marker covers the block it is written in and every step nested inside it, and
a test is also covered by a marker that each of its steps has. So a test's
shared `// Given:` covers its steps, but a step never borrows a sibling's
markers.

For complex tests with multiple assertions, use nested steps:

```ts ignore
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";

Deno.test("Feature behaves correctly", async (t) => {
	// Given
	const input = setupTestData();

	// When
	const result = performOperation(input);

	// Then
	await t.step("validates output type", () => {
		assertType<IsExact<typeof result, ExpectedType>>(true);
	});

	await t.step("validates output value", () => {
		assertEquals(result, expectedValue);
	});
});
```

#### BDD Guidelines

- **Given**: Set up test data, create instances, define preconditions
- **When**: Execute the specific behavior or function being tested
- **Then**: Assert expected outcomes using `assertEquals`, `assertType`, etc.
- Use descriptive test names that describe the behavior, not implementation
- Group related assertions using `t.step()` for better test output

### Running Tests

```bash
# Run all tests
deno test --no-prompt --parallel

# Run tests with coverage
deno task gaps

# Run tests for specific package
deno test packages/enum/
```

### Coverage Requirements

- Aim for comprehensive test coverage
- Use `deno task gaps` to identify untested code
- Critical paths must be tested

## Commit Guidelines

We follow conventional commits for clear history:

```txt
type(scope): description

[optional body]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `test`: Adding or updating tests
- `refactor`: Code restructuring without behavior change
- `docs`: Documentation changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Scopes

Use package names as scopes:

- `@sekhmet/effect`
- `@sekhmet/enum`
- `@sekhmet/matrix`
- `@sekhmet/panic`
- `@sekhmet/primordials`
- `@sekhmet/vow`
- `@sekhmet/add`, `@sekhmet/ci`, `@sekhmet/playground` (scripts)
- Or specific areas within packages

### Examples

```txt
feat(@sekhmet/enum): add eliminate function

test(@sekhmet/enum): add exit tests

chore(@sekhmet/enum): add eliminate mini exports
```

## Pull Request Process

1. **Create a feature branch**:

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes**:
   - Write code following the standards above
   - Add tests for new functionality
   - Update documentation if needed

3. **Run checks**:

   ```bash
   deno task ci
   ```

4. **Commit your changes** using conventional commits

5. **Push and create a PR**:
   - Provide a clear description of changes
   - Reference any related issues
   - Ensure CI passes

6. **Address review feedback**:
   - Make requested changes
   - Keep commits clean (squash if needed)

### Documenting your change

- **JSDoc** on every export, with an `@example` that runs. Every entrypoint
  module starts with a `@module` doc. JSR renders these as the API reference.
- **Examples are tests.** `deno test --doc` (part of `deno task ci`)
  type-checks and runs every `ts` code block in JSDoc and in markdown files,
  so write examples with explicit imports from the public entrypoint (e.g.
  `@sekhmet/enum/option/mini`) and assert their claims with `@std/assert`.
  Fence a block as `ts ignore` only when it cannot run.
- **Mini examples feed main.** `deno task gen:main` copies mini examples into
  the generated main modules, rewriting calls to method form and imports to
  the main entrypoint, so both forms are checked.
- **Guides** live in each package's `docs/` folder (`getting-started.md`,
  `concepts.md`, `recipes.md` lead the sidebar, in that order).
  `deno task docs:dev` serves the site that assembles them with every README;
  `deno task docs:build` builds it.

### PR Checklist

- [ ] Code follows project style and conventions
- [ ] Tests added/updated and passing
- [ ] Documentation updated (README, JSDoc comments)
- [ ] Commit messages follow conventional format
- [ ] `isolatedDeclarations` compatibility maintained
- [ ] No external dependencies added
- [ ] CI checks passing
- [ ] A dv Record for each user-visible package change (see [Releasing](#releasing))

## Releasing

Every merge to `main` can release. There is no release branch or release PR:
the Records a PR carries decide what ships.

### Adding a Record

When a PR changes what a package's users see, add a Record describing it:

```bash
deno task dv add --packages @sekhmet/enum --type feat --message "Add Option.zip"
```

This writes a file under `.dv/records/` and stages it; commit it with the
change. Types are `fix` (patch), `feat` (minor) and `feat!`/`fix!` (breaking).
While a package is `0.x`, breaking changes bump the minor version. Refactors,
tests and docs need no Record. `deno task dv status` previews the bumps, and the
`dv-validate` check rejects malformed Records or unknown packages.

`deno task dv` runs the dv version CI uses: `jsr:@dv-cli/dv` is pinned
exactly in `scripts/dv/deno.json`, its dependencies are locked in `deno.lock`,
and the task runs with `--frozen`. CI puts the same launcher on `PATH` as `dv`
(`.github/actions/setup-dv`). To bump dv, change the pin and run
`deno install` to update the lockfile.

### What happens on merge

`.github/workflows/release.yml` first runs the full gate (`deno task ci`);
a red tree stops the job before anything is versioned or published. It then
runs `scripts/release/main.ts`, which only proceeds from the commit `main`
points at:

1. `dv version` consumes pending Records: it bumps each `deno.json`, writes
   each package's `CHANGELOG.md`, and commits `chore(release): …` to `main`.
2. `dv release` tags each untagged version as `<package>@<version>` and runs
   `deno publish` per package, dependencies first (primordials before enum,
   and so on). JSR authenticates the workflow over GitHub OIDC, so no token
   is stored. Then it pushes the tags.
3. Each package uploaded to JSR gets a GitHub Release with its changelog
   section.

An untagged version is released even without a Record, which is how the
first run publishes every package at its current `0.1.0`. A merge with no
Records and nothing untagged releases nothing. If a publish fails (or takes
longer than five minutes), the job fails after the other packages publish;
rerun the `release` workflow on `main` from the Actions tab with **force**
checked. Versions already on JSR are skipped, and the recovered packages get
their GitHub Releases.

Only packages under `packages/` are released. Members marked
`"publish": false` (everything in `scripts/`) never are.

## Adding New Packages

Use the scaffolding tool to create a new workspace:

```bash
deno task add
```

This will guide you through creating either a library or CLI package with the
correct structure.

### Package Naming

- Scoped: `@sekhmet/package-name`
- Lowercase with hyphens
- Descriptive and concise

### Package Requirements

New packages should:

- Include `main`/`mini` export paths for large features, or a flat structure for small features
- Have comprehensive README with usage examples
- Follow the same TypeScript strictness
- Include test coverage
- Export type utilities where appropriate
- Maintain composability with other Sekhmet packages

## Questions?

If you have questions or need clarification:

1. Check existing issues and PRs
2. Review package READMEs and source code
3. Open a discussion or issue

Thank you for contributing to Sekhmet!
