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

3. Turn on the [commit gate](#commit-gate) for your clone:

   ```bash
   deno task hooks
   ```

4. Run CI checks to ensure everything works:

   ```bash
   deno task ci
   ```

### Playground

`playground/` at the repository root is gitignored and never checked by
`deno task ci`, so keep scratch scripts, tests and notebooks there. Your editor
still covers it: the Deno language server (hovers, completions, type errors,
Deno's lint) and Biome (formatting, lint, organize imports) both see the
folder. Imports of `@sekhmet/*` resolve to the checked-out source, so you are
always playing with the current branch (or, after `deno task play:link`, with a
worktree's):

```bash
deno run playground/try.ts         # any script that imports @sekhmet/*
deno check playground/try.ts       # type-check it
deno test playground/              # run the Deno.test files in it
deno lint playground/              # Deno's lint rules
deno task fmt playground/          # format and lint-fix it with Biome
```

Playground tests are ordinary `Deno.test` files (`playground/try.test.ts`)
that import `@std/assert`, `@std/testing` and `@sekhmet/*` as the packages'
own tests do; `deno test playground/try.test.ts` runs one. They are scratch, so
the Given/When/Then comments the gate requires elsewhere are up to you.

The gate stays off it in two ways: Biome, `deno check`, `deno lint` and
`deno test` run over the paths git does not ignore
(`scripts/ci/gate-files.ts`; `deno test` gets the top-level directories they
live in, so its own discovery and the `deno.json` excludes still apply inside
them), and the publish-readiness scans skip it. `deno.json` excludes nothing
for it, so the commands above, and the editor, treat it like any other folder.

- **`deno task play:notebook`** copies a starter notebook to
  `playground/start.ipynb` (it never overwrites yours). Open it in VS Code with
  the Jupyter extension and pick the Deno kernel; if the kernel isn't listed,
  run `deno jupyter --install` once.
- **`deno task play:link <target>`** points `playground/` at another tree's
  packages, so you can dogfood a worktree's branch without switching the main
  checkout (see below).

#### Dogfooding a worktree

Your editor's `playground/` lives in the main checkout, but the branch you want
to try often lives in a worktree (`.claude/worktrees/…`). `play:link` writes a
`playground/deno.json` that links every `@sekhmet/*` package to that tree, so
hovers, completions and the `deno` commands in `playground/` use its source
(see "Which commands follow the link" below):

```bash
deno task play:link refactor/schema-declarative  # the worktree on that branch
deno task play:link ../some/checkout             # any checkout, by path
deno task play:link main                         # back to this checkout
deno task play:link                              # what is linked, and is it still there?
deno task play:link off                          # back to the root workspace
```

- **A target** is `main` (or `checkout`) for this clone's own checkout, a
  branch name for the worktree that has it checked out (it lists the branches
  that have one when yours does not), or a path starting with `/`, `.` or `~`.
  It works the same run from the main checkout or from any worktree, and always
  writes the main checkout's `playground/deno.json`.
- **The file is not a workspace member**, so Deno treats `playground/` as a
  standalone project and prints
  `Warning: config file …/playground/deno.json is not a member of the workspace … Ignoring the parent workspace config.`
  That warning is expected while linked. The root workspace no longer applies
  there, so `play:link` copies the target root `deno.json`'s other `imports`
  (`@std/assert`, `@std/testing`, `@~/`, …) into the file, rebasing relative
  paths onto `playground/`.
- **It owns what it writes**: the `@sekhmet/*` entries of `imports` (one
  `jsr:` specifier per package, which `links` overrides, so unpublished
  packages work too), the root imports it copied, `links` (every package of the
  target, relative to `playground/`), and `compilerOptions` (copied from the
  target's root `deno.json`, so strictness matches). It records the root
  imports it copied under a `playLink` key, so a relink or `off` removes
  exactly those. An import you set yourself keeps your value and is never
  recorded, and every other key you add is kept on relink and on `off`; `off`
  deletes the file only when nothing of yours is left in it.
- **Which commands follow the link** depends on where Deno looks for a
  config. `deno test`, `deno check` and `deno info` start from the current
  directory; `deno run` and `deno lint` start from the file. So run from inside
  the playground (`cd playground && deno test`), where every command uses the
  link. From the repository root, `deno run playground/try.ts` and
  `deno lint playground/` use the link, but `deno test playground/` and
  `deno check playground/try.ts` use the root workspace (this checkout's
  packages) unless you pass `--config playground/deno.json`.
- **Restart the Deno language server after switching** (VS Code:
  `Deno: Restart Language Server`) so it resolves through the new `links`.
- **Worktrees go away after their branch merges.** `deno task play:link` with no
  target reports links whose directories no longer exist; relink with
  `deno task play:link main` or drop the link with `off`.

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
│   ├── dispatch/     # Typed one-shot signals (DispatchController, DispatchSignal)
│   ├── effect/       # Effect system (effects, fibers, runtime, scheduler)
│   ├── enum/         # Enum framework (core, option, result, either, latch, poll, ordering, control-flow)
│   ├── job/          # CI-runner-style job graphs (plans, runIf conditions, typed outcomes)
│   ├── lifetime/     # RAII: Resource (init/deinit) and Lifetime ownership trees
│   ├── matrix/       # Cartesian-product test case generation
│   ├── panic/        # Panic errors and the panic runtime (hook, catchUnwind)
│   ├── primordials/  # Core primitives (Struct, Subtle, scoping helpers)
│   ├── schema/       # Typed validation and transformation (Schema, composites, algebra)
│   ├── vow/          # Synchronous promise-like values
│   └── workflow/     # Workflow helpers (todo/unimplemented, unreachable, invariant checks)
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

**A package with no main/mini split hands out main values.** Every `Option`,
`Result`, `Outcome`, `Vow` or `Recovery` it returns is the method-chaining main
form (import `@sekhmet/enum/option`, not `@sekhmet/enum/option/mini`); a type
with no main class yet is returned as its mini form until it gets one. A main
value subclasses the mini one, so it passes anywhere a mini value is accepted.
See [patterns.md](.claude/patterns.md) (#109).

**Every enum is structured like `Option` and `Result`**, whether or not its
package has a main/mini split. Mini holds an exported `…Variants` type, a class
extending `Enum` with an empty body, a constructor function per variant
(`Some`, `None`), and predicates, accessors and unwraps as `self`-first
functions; main is a class extending the mini one, with methods and
`fromMini`, generated by `deno task gen:main`. An enum's own definition (its
variants and anything they hold) is built only from mini enums. See
[patterns.md](.claude/patterns.md) (#110).

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
When the function's prose talks about parameters the method doesn't take, a
borrow can give the method its own `doc` (description, params, returns,
example).

A field method can also take one argument: `argument` names the other field
of the options object that it fills (`or({ left, right })` with
`field: "left", argument: "right"` becomes `.or(right)`). The argument is
typed by indexing the options type (`OrOptions<I, O, E, J, P, F>["right"]`),
whose type parameters past the class's become the method's own, so they are
inferred from the argument. A borrow with a `property` (`name`, `className`,
`doc`) puts its methods on a generated namespace class instead of the
primary: the primary gets a getter `name` returning a `className` that
holds the instance (`schema.with.or(other)`). Every namespace method needs
its own `doc`, since the function's examples aren't rewritten for it, and
gen-main rejects a getter, class or method name that is already taken.

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

#### Type tests: exact, rejection and variance

A public generic type (and every API whose safety rests on its types) gets
three kinds of type test, not just the first. `IsExact` checks a type in
isolation; soundness bugs live in the relationships between types, which only
the other two kinds see. _Why: two reviews of `@sekhmet/schema` (2026-11-16)
found a forgeable typed key and an order-dependent variance bug that 600+
passing tests, nearly all `IsExact`, had missed._

1. **Exact**: what a construct infers, with `assertType<IsExact<…>>(true)`.
2. **Rejection**: what must _not_ compile, with `// @ts-expect-error` on the
   exact line that should fail (and a word on why). Forge the type by hand,
   narrow it, read a member that an operation should have removed. Keep each
   expected error on one line: a `@ts-expect-error` above a multi-line
   expression may be satisfied by a different error.
3. **Variance**: assignment between instantiations in both directions. Widening
   is accepted and narrowing rejected, checked in more than one order, since
   TypeScript caches variance and an order-dependent bug can hide behind the
   first check.

```ts ignore
import { assertType, type IsExact } from "@std/testing/types";

Deno.test("Schema's output is covariant", () => {
	// Given: a schema of a narrow output, and one of a wide output
	const narrow = literal("a");
	const wide = string();

	// When / Then: inference is exact
	assertType<IsExact<Output<typeof narrow>, "a">>(true);

	// Then: widening is accepted
	const widened: Schema<unknown, string, SchemaIssue> = narrow;

	// Then: narrowing is rejected
	// @ts-expect-error a string schema is not an "a" schema
	const narrowed: Schema<unknown, "a", SchemaIssue> = wide;
});
```

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

- `@sekhmet/dispatch`
- `@sekhmet/effect`
- `@sekhmet/enum`
- `@sekhmet/job`
- `@sekhmet/lifetime`
- `@sekhmet/matrix`
- `@sekhmet/panic`
- `@sekhmet/primordials`
- `@sekhmet/schema`
- `@sekhmet/vow`
- `@sekhmet/workflow`
- `@sekhmet/add`, `@sekhmet/ci`, `@sekhmet/playground` (scripts)
- Or specific areas within packages

### Examples

```txt
feat(@sekhmet/enum): add eliminate function

test(@sekhmet/enum): add exit tests

chore(@sekhmet/enum): add eliminate mini exports
```

### Commit gate

A git hook refuses a commit unless `deno task ci` passed on exactly the tree
being committed. Turn it on once per clone:

```bash
deno task hooks
```

- **How it is wired:** each branch carries its hooks in `.githooks/`.
  `deno task hooks` installs a small shim for `pre-commit` and
  `pre-merge-commit` into the clone's shared hooks directory
  (`$(git rev-parse --git-common-dir)/hooks`, i.e. `.git/hooks/`), which every
  worktree runs. The shim runs the committing worktree's own
  `.githooks/<hook>`, so each worktree is gated by its own branch's hooks; a
  branch without `.githooks/<hook>` is not gated. Rerunning it is harmless.
- **`core.hooksPath` must stay unset:** while it is set, git ignores
  `.git/hooks/`. `deno task hooks` unsets the old `.githooks` setting
  (relative or absolute) and refuses any other value, as it refuses to
  replace a hook in `.git/hooks/` that it did not install. The old setting
  was one value for every worktree, and Claude Code's worktree setup rewrites
  a relative one to the main checkout's absolute path, so every worktree ran
  whatever hooks the main checkout's branch had.
- `deno task ci` prints a one-line warning while a shim is missing or
  outdated, or `core.hooksPath` is set.

- **Recording:** when every step passes, `deno task ci` records the staged
  tree's id (`git write-tree`) in `$(git rev-parse --git-path ci-green)`, one
  marker per worktree. The gate checks the working tree, not the index, so it
  records only when the two hold the same files: no unstaged change to a
  tracked file and no untracked, unignored file, both before the first step
  and after the last. A failed, blocked or interrupted run records nothing.
- **Checking:** `.githooks/pre-commit` refuses a commit whose staged tree is
  not the recorded one.
- **Markdown exemption:** a commit that changes only `*.md` files (a rename
  counts both its paths) is exempt, unless its staged diff adds, removes or
  changes a line inside a code block that `deno test --doc` runs, in either
  `HEAD`'s or the staged version. The refusal then names those files. As in
  Deno, such a block is a backtick fence (three or more, `~~~` does not count)
  whose first info word is exactly `ts`, `tsx`, `typescript`, `mts`, `cts`,
  `js`, `jsx`, `javascript`, `mjs` or `cjs`, without an `ignore` word
  (`no-eval` is still type-checked). Its fence lines count, so dropping an
  `ignore` is a code change.
- **The workflow:** stage everything (`git add`), run `deno task ci`, then
  commit. Any edit or `git add` after the run needs a new run.
- **Merges:** changes reach `main` only through a pull request merged on
  GitHub (see [Pull Request Process](#pull-request-process)), so the hook
  never sees that merge. Locally, `.githooks/pre-merge-commit` holds a merge
  commit (say, `main` merged into your branch) to the same rule. When `git merge --no-ff` is refused, the merge stays staged: run
  `deno task ci`, then `git commit`. Or start with `git merge --no-commit`.
  A fast-forward makes no commit, so nothing is checked.
- **Escape hatch:** `git commit --no-verify` skips the hook. It is for human
  emergencies only; agents must never use it.

### `todo` stays out of published packages

`@sekhmet/workflow`'s `todo` is a placeholder, so it must not ship. The
publish-readiness step of `deno task ci` fails when a package's non-test
source (its `src/` and its top-level modules alike) reaches `todo` through:

- a value import binding `todo`, under any alias or quoted name;
- a re-export of `todo`, or an `export *` of a module holding it;
- `ns.todo`, `ns?.todo` or `ns["todo"]` through a namespace import of a
  module holding it;
- a dynamic `import()` of a module holding `todo`, with a literal specifier.

A named import is flagged whatever is done with the binding afterwards
(`f = todo; f()`, `todo.call`). A namespace import is flagged only by those
three member forms, so destructuring it (`const { todo } = wf`), a computed
key (`wf[key]`) or passing the namespace to a function goes unflagged.

The package is recognized by every specifier form: bare, `jsr:` (with a
version), `@jsr/sekhmet__workflow` with or without `npm:`,
`https://jsr.io/@sekhmet/workflow/…` URLs, and relative or `@/` paths into
`packages/workflow`. Tests, the playground, `scripts/` and
`@sekhmet/workflow` itself may use `todo` freely. `unimplemented`,
`unreachable` and the invariant checks are meant to ship and are never
flagged. To fix a finding, finish the work, or replace the `todo` with
`unimplemented` if the path will stay unsupported.

## Pull Request Process

Sekhmet follows GitHub Flow. `main` is protected by a ruleset: it cannot be
deleted or force-pushed, and every change lands through a pull request, merged
by squash or rebase so history stays linear. Nobody pushes to `main` directly;
only the release bot does (see [What happens on merge](#what-happens-on-merge)).
A PR merges once its branch is up to date with `main`, its review threads are
resolved, and these checks pass:

- `ci` (`ci.yml`: `deno task ci`)
- `validate` (`dv-validate.yml`: dv Records and the dv plugin)
- the seven `compat` suite jobs (`compat.yml`): `suite (node, Node 24)`,
  `suite (node, Node 26)`, `suite (bun)`, `suite (chromium)`,
  `suite (firefox)`, `suite (webkit)` and `suite (workerd)`

No approval is required. Repository admins can bypass the ruleset.

1. **Create a feature branch** off `main`:

   ```bash
   git switch -c feat/my-feature main
   ```

2. **Make your changes**:
   - Write code following the standards above
   - Add tests for new functionality
   - Update documentation if needed

3. **Stage your changes, then run checks** on exactly what is staged:

   ```bash
   git add <paths>
   deno task ci
   ```

4. **Commit your changes** using conventional commits; the
   [commit gate](#commit-gate) refuses a commit without a green run

5. **Push your branch and open a PR** against `main`:
   - Provide a clear description of changes
   - Reference any related issues
   - Ensure the required checks pass

6. **Address review feedback**:
   - Make requested changes
   - Keep commits clean (squash if needed)

7. **Merge** with **Squash and merge** or **Rebase and merge**; merge commits
   are not allowed. Update the branch from `main` first if GitHub asks.

### Documenting your change

- **JSDoc** on every export, with an `@example` that runs. Every entrypoint
  module starts with a `@module` doc. JSR renders these as the API reference.
- **JSR score.** `deno task ci` enforces every part of the
  [JSR score](https://jsr.io/docs/scoring) the repo controls, so a package
  scores fully from its first release:

  | JSR criterion                        | Enforced by                                       |
  | ------------------------------------ | ------------------------------------------------- |
  | Has a README or module doc           | readiness `package-files` (README.md)             |
  | Has examples in README or module doc | readiness `readme-examples` (a fenced code block) |
  | All entrypoints have module docs     | readiness `module-doc` (a leading `@module` doc)  |
  | Has docs for most symbols            | `deno doc --lint` over each export set            |
  | No slow types                        | the JSR publish dry run                           |

  The rest live outside the repo: provenance comes from publishing in the
  `release` workflow over GitHub OIDC, and the description and runtime
  compatibility are package settings on jsr.io (JSR does not read them from
  `deno.json`), so set them in each package's settings page.
- **Examples are tests.** `deno test --doc` (part of `deno task ci`)
  type-checks and runs every `ts` code block in JSDoc and in markdown files,
  so write examples with explicit imports from the public entrypoint (e.g.
  `@sekhmet/enum/option/mini`) and assert their claims with `@std/assert`.
  Fence a block as `ts ignore` only when it cannot run.
- **Mini examples feed main.** `deno task gen:main` copies mini examples into
  the generated main modules, rewriting calls to method form and imports to
  the main entrypoint, so both forms are checked.
- **Guides** live flat in each package's `docs/` folder, and each serves one
  [Diátaxis](https://diataxis.fr) need, declared in frontmatter at the top of
  the page (#54):

  ```md
  ---
  kind: tutorial
  ---

  # Getting started
  ```

  `kind` is one of `tutorial`, `how-to`, `explanation` or `reference`; the
  frontmatter is flat `key: value` lines, and an unknown kind fails
  `deno task docs:build`, naming the file. The site gives each package's
  sidebar the Overview (its README), then any untagged pages, then a group
  per kind that has pages: Tutorials, How-to guides, Explanation and
  Reference. Reference always links the package's API docs on JSR, which are
  generated from its JSDoc. Within a group, `getting-started` leads and the
  rest sort by their `#` title, which is also the sidebar label. Untagged
  pages stay listed until they are converted; `kind` is not yet required.
  Biome keeps the frontmatter intact only because `biome.json` sets
  `markdown.parser.frontmatter`; without it, `deno task fmt` rewrites the
  block into a rule and a `## kind: …` heading. GitHub shows the frontmatter
  as a table above the page.
  `deno task docs:dev` serves the site that assembles them with every README;
  `deno task docs:build` builds it. To see an edit while `docs:dev` runs,
  re-run `deno task docs:assemble --include-unpublished`: it writes only the
  pages whose text changed and removes stale ones, so the server hot-updates
  those pages instead of restarting. The built site, which
  `.github/workflows/docs.yml` deploys, leaves out unpublished packages
  (`"publish": false`): they have no JSR page, and links to them point at
  GitHub. `docs:dev` previews them locally: it passes
  `--include-unpublished` to `deno task docs:assemble`, so an unpublished
  package gets its pages and kind-grouped sidebar like any other, without
  the JSR API link, and each of its pages opens with a "Prototype" warning
  that it isn't on JSR. Relative links to source files, such as `../mod.ts`,
  point at the file on GitHub.
- **Decision logs** are project records, not guides: a package's log lives at
  `docs/decisions/<package>.md` at the repo root (e.g.
  `docs/decisions/schema.md`), outside `packages/`, so neither the docs site
  nor JSR presents it (#54, owner decision 2026-11-18). Before a log moves
  there, lift any user-facing reference it alone holds into JSDoc or a guide.
  Link it from the package README's design-record line with an absolute
  GitHub URL, since JSR renders the README:
  `https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/<package>.md`.

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

Every PR merged to `main` can release. There is no release branch or release
PR: the Records a PR carries decide what ships.

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

The release bot is the one pusher to `main` outside a PR. It pushes the
`chore(release): …` commit and the tags with `DV_PAT`, the owner's
fine-grained token (this repository only, `contents: write` and
`workflows: write`), which has the ruleset's admin bypass. That push runs
`ci`, `compat` and the docs deploy again on the bump commit; the `release`
run it starts skips itself, so releases never recurse.

An untagged version is released even without a Record, which is how the
first run publishes every package at its current `0.1.0`. A merge with no
Records and nothing untagged releases nothing. If a publish fails (or takes
longer than five minutes), the job fails after the other packages publish;
rerun the `release` workflow on `main` from the Actions tab with **force**
checked. Versions already on JSR are skipped, and the recovered packages get
their GitHub Releases.

A package's first release needs the package to exist on JSR already: JSR
never creates one on upload, and `deno publish` fails with "Following
packages don't exist". See "First release on JSR" under Adding New Packages.

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

### First release on JSR

Before the PR that publishes a new package merges, a maintainer of the
`@sekhmet` scope does two things on JSR:

1. Creates the package at
   `https://jsr.io/new?scope=sekhmet&package=<name>`.
2. In the package's **Settings**, links the GitHub repository
   `ben-laird/sekhmet`, so the release workflow can publish over GitHub
   OIDC.

If the PR merged first, the release job fails on that package after tagging
it. Do both steps, then rerun the `release` workflow on `main` with
**force** checked (see What happens on merge). `@sekhmet/schema` 0.1.0 was
published this way (2026-11-18).

## Questions?

If you have questions or need clarification:

1. Check existing issues and PRs
2. Review package READMEs and source code
3. Open a discussion or issue

Thank you for contributing to Sekhmet!
