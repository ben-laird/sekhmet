# Common Patterns

Recurring implementation patterns found throughout Sekhmet.

## Enum Narrowing Patterns

### Type guard pattern (isolate)

```ts ignore
import { isolate, union } from "@sekhmet/enum/core/mini";

type Result = Split<{
	Ok: [value: number];
	Err: [error: string];
}>;

class ResultEnum extends Enum<Result> {}

function processResult(result: ResultEnum): void {
	// Type guard narrows the enum type
	if (isolate(result, "Ok")) {
		// result is now Enum<Isolate<Result, "Ok">>
		const value = union(result); // type: number
		console.log(`Success: ${value}`);
	} else {
		// result is narrowed to Enum<Eliminate<Result, "Ok">>
		// which is Enum<[kind: "Err", error: string]>
		const error = union(result); // type: string
		console.log(`Error: ${error}`);
	}
}
```

### Assertion pattern (assertIsolated)

```ts ignore
import { assertIsolated, union } from "@sekhmet/enum/core/mini";

function mustBeSuccess(result: ResultEnum): number {
	// Throws if not "Ok", otherwise narrows type
	assertIsolated(result, "Ok", "Expected successful result");

	// result is asserted to be Enum<Isolate<Result, "Ok">>
	return union(result); // type: number
}
```

### Elimination pattern (eliminate)

```ts ignore
import { eliminate, union } from "@sekhmet/enum/core/mini";

function isNotPending(result: ResultEnum): boolean {
	// Returns true if NOT "Pending"
	if (eliminate(result, "Pending")) {
		// result is Enum<Eliminate<Result, "Pending">>
		// Could be "Ok" or "Err" but definitely not "Pending"
		return true;
	}
	return false;
}
```

### Inspection pattern (inspectIsolated)

```ts ignore
import { inspectIsolated } from "@sekhmet/enum/core/mini";

function logIfError(result: ResultEnum): void {
	// Only runs callback if the variant matches
	inspectIsolated(result, "Err", (error) => {
		// error has type: string
		console.error(`Error occurred: ${error}`);
	});
}
```

### Iteration pattern (iterIsolated)

```ts ignore
import { iterIsolated } from "@sekhmet/enum/core/mini";

function processSuccesses(results: ResultEnum[]): number[] {
	const values: number[] = [];

	for (const result of results) {
		// Generator yields only if variant matches
		for (const value of iterIsolated(result, "Ok")) {
			values.push(value); // value has type: number
		}
	}

	return values;
}
```

## Pattern Matching

### Exhaustive matching with match()

```ts ignore
import { match } from "@sekhmet/enum/core/mini";

type Status = Split<{
	Loading: [];
	Success: [data: string];
	Error: [error: Error];
}>;

class StatusEnum extends Enum<Status> {}

function renderStatus(status: StatusEnum): string {
	// All arms must be present - TypeScript enforces exhaustiveness
	return match(status)({
		Loading: () => "Loading...",
		Success: (data) => `Success: ${data}`,
		Error: (error) => `Error: ${error.message}`,
	});
}
```

### Manual pattern matching

```ts ignore
import { unionKinds, union } from "@sekhmet/enum/core/mini";

function manualMatch(status: StatusEnum): string {
	const kind = unionKinds(status);

	switch (kind) {
		case "Loading":
			return "Loading...";
		case "Success": {
			const data = union(status);
			return `Success: ${data}`;
		}
		case "Error": {
			const error = union(status);
			return `Error: ${error.message}`;
		}
		default:
			// Exhaustiveness check
			const _exhaustive: never = kind;
			throw new Error(`Unhandled case: ${_exhaustive}`);
	}
}
```

## Struct Encapsulation Pattern

### Private data with public methods

```ts ignore
import { Struct, getStructParams } from "@sekhmet/primordials/struct";

interface CounterData {
	value: number;
}

class Counter extends Struct<CounterData> {
	constructor(initial = 0) {
		super({ value: initial });
	}

	// Public method accessing private data
	increment(): number {
		const data = getStructParams(this);
		data.value += 1;
		return data.value;
	}

	// Public method accessing private data
	getValue(): number {
		return getStructParams(this).value;
	}
}

// Usage
const counter = new Counter(10);
counter.increment(); // 11
counter.getValue(); // 11

// Direct access to internal data (if needed)
const data = getStructParams(counter);
console.log(data.value); // 11
```

### Immutable wrapper pattern

```ts ignore
import { Struct, getStructParams } from "@sekhmet/primordials/struct";

interface Point {
	x: number;
	y: number;
}

class ImmutablePoint extends Struct<Point> {
	constructor(x: number, y: number) {
		super({ x, y });
	}

	// Return new instance instead of mutating
	move(dx: number, dy: number): ImmutablePoint {
		const { x, y } = getStructParams(this);
		return new ImmutablePoint(x + dx, y + dy);
	}

	distanceTo(other: ImmutablePoint): number {
		const { x: x1, y: y1 } = getStructParams(this);
		const { x: x2, y: y2 } = getStructParams(other);
		return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
	}
}
```

## Export Organization Pattern

### When to use main/mini split vs. flat structure

The standard package structure uses a `main/`/`mini/` split to support both kitchen-sink
and tree-shakable imports. However, **small features with only one or two files don't
benefit from this split** — the overhead of the extra barrel files adds complexity with no
value.

**Use main/mini split when:**

- The feature has multiple independently tree-shakable exports (e.g. `isolate`, `eliminate`, `exit` in `@sekhmet/enum/core`)
- The feature has a meaningful difference between "kitchen sink" and "individual function" bundles

**Use flat structure (no main/mini) when:**

- The feature has only one implementation file (e.g. `continuation`, `runtime`)
- The feature has a small, cohesive set of exports that don't need individual splitting (e.g. `scheduler`)

**Flat feature structure:**

```txt
feature/
├── mod.ts          # Single barrel re-exporting from implementation files
├── feature.ts      # Implementation (instead of mini/feature.ts)
└── feature.test.ts # Tests (instead of mini/feature.test.ts)
```

**Corresponding deno.json exports for flat features:**

```json
{
	"./feature": "./src/feature/mod.ts",
	"./feature/feature": "./src/feature/feature.ts"
}
```

**Real examples in `@sekhmet/effect`:**

- `continuation/` — flat (single file, no tree-shaking benefit)
- `runtime/` — flat (single file, no tree-shaking benefit)
- `scheduler/` — flat (cohesive scheduler + schedules, no benefit to splitting further)
- `effect/` — main/mini split: `./effect` → generated method-chaining `Effect` class; `./effect/mini` → functional API
- `fiber/` — main/mini split: `./fiber` → generated method-chaining `Fiber` class; `./fiber/mini` → functional API

### Granular exports in deno.json

```json
{
	"name": "@sekhmet/package",
	"version": "0.1.0",

	"exports": {
		// Kitchen sink - everything
		".": "./mod.ts",

		// Feature-level exports
		"./core": "./src/core/main/mod.ts",
		"./utils": "./src/utils/main/mod.ts",

		// Mini (tree-shakable) feature exports
		"./core/mini": "./src/core/mini/mod.ts",
		"./utils/mini": "./src/utils/mini/mod.ts",

		// Individual function exports
		"./core/mini/isolate": "./src/core/mini/isolate.ts",
		"./core/mini/eliminate": "./src/core/mini/eliminate.ts",
		"./utils/mini/transform": "./src/utils/mini/transform.ts"
	},

	"imports": {
		"@/": "./"
	}
}
```

### Re-export pattern

```ts ignore
// packages/package/src/core/mini/mod.ts
// Collect all mini exports in one barrel file
export * from "./isolate.ts";
export * from "./eliminate.ts";
export * from "./exit.ts";
export * from "./core.ts";

// packages/package/src/core/main/mod.ts
// Generated from the mini barrel by `deno task gen:main` (see below).

// packages/package/mod.ts
// Top-level re-exports all main features
export * from "./src/core/main/mod.ts";
export * from "./src/utils/main/mod.ts";
```

### Main is generated from mini

Mini is the hand-written source of truth: free functions, tree-shakable one by
one. Main is the method-chaining API (`Some(1).map(f).unwrapOr(0)`), in the
style of Zod v4's main/mini split, and it is **generated** from mini by
`scripts/gen-main`. Never edit a `main/mod.ts` listed in
`scripts/gen-main/src/config.ts`; it starts with
`// GENERATED by scripts/gen-main — do not edit`.

The workflow:

1. Write or change the mini function (with JSDoc and an `@example`).
2. Run `deno task gen:main` to regenerate every main module.
3. Commit the mini change and the regenerated main modules together.

`deno task gen:main --check` regenerates in memory and exits non-zero, listing
each stale file, when a checked-in main module differs from what mini
produces.

To give a new feature a generated main, add an entry to `FEATURES` in
`scripts/gen-main/src/config.ts`:

```ts ignore
{
	entrypoint: "@sekhmet/enum/option", // the public main entrypoint
	mini: "packages/enum/src/option/mini/mod.ts", // the mini barrel
	output: "packages/enum/src/option/main/mod.ts", // the generated file
	primary: "Option", // the mini class main extends
	construct: "variant", // "variant" for Enum subclasses, "params" for plain Structs
	mappers: ["map"], // optional: the main method mapping each type argument
	wraps: [{ type: "Result", from: "../../result/main/mod.ts", mappers: ["map", "mapErr"] }], // optional
	uncurry: [], // optional: curried functions whose method takes the inner parameters
	omit: [], // optional: mini exports to leave out of main
}
```

### What the generator produces

For `class Option<T> extends Enum<…>` in mini, main gets one plain class,
`class Option<T> extends mini.Option<T>`, holding only that type's own
functions as methods. Mini `Option` still extends mini `Enum`, so a main
`Option` is `instanceof` both mini classes and every mini function accepts it.

- **Methods.** Every exported mini function whose first parameter is
  `self: <Primary>` becomes a method. `self` becomes `this`, `self is X`
  becomes `this is X`, `asserts self is X` becomes `asserts this is X`, and
  overloads are kept. Type parameters that `self`'s type fixes become the
  class's; the rest stay on the method (`filter<T, U extends T>` becomes
  `filter<U extends T>`). JSDoc is copied without `@param self`, and
  `@see {@link mini.fn}` is added.
- **Examples.** Every example copied into main (methods, constructors, the
  class) is rewritten for main: calls of any function that became a method
  move to method form, and imports from `<entrypoint>/mini` (or a mini
  subpath) move to `<entrypoint>`, dropping the names that are now methods.
  So write mini examples against the mini entrypoint with explicit imports;
  `deno test --doc` then checks both forms.
- **Chaining.** A method whose mini return type is the primary type (at the
  top level) returns the main class. The result goes through the class's
  static `fromMini`, which returns the value unchanged when it already is a
  main instance (so methods that return `self` keep its identity) and
  otherwise returns a main view that shares the mini instance's struct params,
  so a change through either is visible through both (Struct-based classes
  pass the params to the constructor; Enum-based ones are built from the
  variant and then rebound to the same params through the `struct` symbol).
- **Rule: conversions to another feature's type return that feature's main
  class.** In main, chaining never drops back to mini, even across types:
  `Some(1).okOr("e")` is a main `Result`, `Ok(1).ok()` a main `Option`,
  `fiber.joinEffect()` a main `Effect`. A feature lists the other features'
  types it returns under `wraps` in `scripts/gen-main/src/config.ts`; they
  convert through that class's `fromMini` exactly like the primary.
- **Where conversion applies.** Every position of a return type that a caller
  receives a value from:
  - the return type itself (`Option<T>`);
  - a wrap target nested in a wrap target's type arguments
    (`transpose` returns `Result<Option<T>, E>`), converted through the outer
    class's mapper for that argument, declared as `mappers` in the config
    (`["map", "mapErr"]` for `Result`). The outer value is then a new instance
    produced by that mapper rather than a view of the mini one;
  - the plain elements of a returned tuple (`unzip` returns
    `[first: Option<T>, second: Option<U>]`);
  - the yielded values of a returned `Generator`/`IterableIterator` whose
    return type is `void`; the method becomes a generator that re-yields each
    value, so it stays lazy (`Enum.iterAnyIsolated`).

  Parameters keep their mini types (they accept main and mini values alike),
  as do positions the generator can't convert without changing behaviour:
  unions, tuples with optional elements, generators with a non-`void` return
  value, and other generic containers.
- **Import cycles.** Because of that rule, main modules that convert to each
  other import each other (`option/main` ↔ `result/main`; `latch/main` imports
  both). The cycle is safe because a generated module uses another feature's
  class only inside function and method bodies, never while the module
  evaluates; `scripts/gen-main/src/cycle.ts` checks every generated module for
  module-scope uses and fails generation if it finds one. The cost is bundle
  size: importing any of these main entrypoints pulls in the main classes it
  converts to (and theirs), so `@sekhmet/enum/option` also loads
  `@sekhmet/enum/result`'s main module. Use the mini entrypoints when bundle
  size matters.
- **Constructors and other free functions.** A function without `self` whose
  return needs converting (`Some`, `None`, `flatten`, `unzip`, `transpose`,
  `compareNumbers`, `fork`) is re-declared in main as a wrapper that returns
  main classes, so `Some(1).map(…)` chains. Everything else mini exports is
  re-exported unchanged.

```ts ignore
// mini/transform.ts
export function map<T, U>(self: Option<T>, mapping: (value: T) => U): Option<U> { … }

// main/mod.ts (generated)
export class Option<out T> extends mini.Option<T> {
	static fromMini<T>(self: mini.Option<T>): Option<T> {
		if (self instanceof Option) return self;

		const params = getStructParams(self);
		const view = new Option<T>(...params.variant);
		view[struct] = params;

		return view;
	}

	map<U>(mapping: (value: T) => U): Option<U> {
		return Option.fromMini(mini.map(this, mapping));
	}
}

export function Some<T>(value: T): Option<T> {
	return Option.fromMini(mini.Some(value));
}
```

Functions whose first parameter is not `self` of the primary type (e.g.
`fork(self: Runtime, …)`, `flatten(opt: Option<Option<T>>)`) never become
methods.

### Writing mini so main generates cleanly

- Name the receiver `self` and type it as the primary class with each of the
  class's type parameters passed as a distinct function type parameter
  (`self: Latch<A, I>`). Don't name another type parameter after one of the
  class's.
- Annotate every return type (`isolatedDeclarations` already requires it).
- Use plain or rest parameters; destructured or defaulted parameters are
  rejected.
- If generation fails, `deno task gen:main` names the feature, the symbol and
  the reason.

## Type Utility Patterns

### Extracting variant information

```ts ignore
import type { Kinds, Values, Isolate, Eliminate } from "@sekhmet/enum/core/mini";

type MyVariants =
	| [kind: "A", value: string]
	| [kind: "B", value: number]
	| [kind: "C"];

// Get all possible kind strings
type AllKinds = Kinds<MyVariants>; // "A" | "B" | "C"

// Get all possible values
type AllValues = Values<MyVariants>; // string | number | undefined

// Isolate a specific variant
type OnlyA = Isolate<MyVariants, "A">; // [kind: "A", value: string]

// Eliminate a specific variant
type NotA = Eliminate<MyVariants, "A">; // [kind: "B", value: number] | [kind: "C"]

// Get value type of a specific variant
type ValueOfA = Values<Isolate<MyVariants, "A">>; // string
```

### Inferring enum type from instance

```ts ignore
import type { InferEnum } from "@sekhmet/enum/core/mini";

class MyEnum extends Enum<MyVariants> {}

// Extract the variant type from an Enum class
type ExtractedVariants = InferEnum<MyEnum>; // MyVariants
```

### Split helper for ergonomic variants

```ts ignore
import type { Split } from "@sekhmet/enum/core/mini";

// Instead of writing tuples manually:
type ManualVariants =
	| [kind: "Success", value: string]
	| [kind: "Error", error: Error]
	| [kind: "Pending"];

// Use Split for better ergonomics:
type ErgonomicVariants = Split<{
	Success: [value: string];
	Error: [error: Error];
	Pending: [];
}>;

// Both produce the same type
```

## Testing Patterns

### Type assertion pattern

```ts ignore
import { assertType, type IsExact } from "@std/testing/types";

Deno.test("validates type inference", () => {
	// Given
	const input = new MyEnum("Success", "data");

	// When
	if (isolate(input, "Success")) {
		const value = union(input);

		// Then - assert the exact type
		assertType<IsExact<typeof value, string>>(true);
	}
});
```

### Nested step pattern for complex tests

```ts ignore
Deno.test("complex feature behavior", async (t) => {
	// Given
	const setup = createTestSetup();

	await t.step("handles success case", () => {
		// When
		const result = setup.process("success");

		// Then
		assertEquals(unionKinds(result), "Ok");
	});

	await t.step("handles error case", () => {
		// When
		const result = setup.process("error");

		// Then
		assertEquals(unionKinds(result), "Err");
	});

	await t.step("validates type narrowing", () => {
		// When
		const result = setup.process("success");

		// Then
		if (isolate(result, "Ok")) {
			assertType<IsExact<typeof result, Enum<Isolate<Result, "Ok">>>>(true);
		}
	});
});
```

## Error Handling Pattern

### Using enums for result types

```ts ignore
import { Enum, type Split } from "@sekhmet/enum/core/mini";
import { match } from "@sekhmet/enum/core/mini";

type Result<T, E = Error> = Split<{
	Ok: [value: T];
	Err: [error: E];
}>;

class ResultEnum<T, E = Error> extends Enum<Result<T, E>> {}

// Factory functions
function ok<T>(value: T): ResultEnum<T, never> {
	return new ResultEnum("Ok", value);
}

function err<E>(error: E): ResultEnum<never, E> {
	return new ResultEnum("Err", error);
}

// Usage
function divide(a: number, b: number): ResultEnum<number, string> {
	if (b === 0) {
		return err("Division by zero");
	}
	return ok(a / b);
}

// Pattern match on result
const result = divide(10, 2);
const message = match(result)({
	Ok: (value) => `Result: ${value}`,
	Err: (error) => `Error: ${error}`,
});
```

## Composition Patterns

### Enum covariance

```ts ignore
// Enum<A> | Enum<B> is equivalent to Enum<A | B>
type VariantA = [kind: "A", value: string];
type VariantB = [kind: "B", value: number];

const a: Enum<VariantA> = new Enum("A", "hello");
const b: Enum<VariantB> = new Enum("B", 42);

// Union of enums
const either: Enum<VariantA> | Enum<VariantB> = Math.random() > 0.5 ? a : b;

// Is the same as
const combined: Enum<VariantA | VariantB> = either;
```

### Chaining operations

```ts ignore
import { isolate, union, eliminate } from "@sekhmet/enum/core/mini";

function processChain(input: ResultEnum): string | null {
	// Chain guards and extractions
	if (eliminate(input, "Pending")) {
		if (isolate(input, "Ok")) {
			return union(input).toString();
		}
	}
	return null;
}
```

## Import Patterns

### Using path aliases

```ts ignore
// Within a package - use @/ for package-local imports
import { myUtil } from "@/src/utils/mini/myUtil.ts";

// Cross-package - use full package names
import { Struct } from "@sekhmet/primordials/struct";
import { Enum } from "@sekhmet/enum/core/mini";

// From workspace root - use @~/
import type { Config } from "@~/config.ts";
```

### Importing for tree-shaking

```ts ignore
// ✅ Best - import individual functions
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { eliminate } from "@sekhmet/enum/core/mini/eliminate";

// ✅ Good - import from mini barrel
import { isolate, eliminate } from "@sekhmet/enum/core/mini";

// ⚠️ Acceptable - import from main (larger bundle; methods on the Enum class)
import { Enum } from "@sekhmet/enum/core";

// ❌ Not available - @sekhmet/enum has no root export; import a feature subpath
```
