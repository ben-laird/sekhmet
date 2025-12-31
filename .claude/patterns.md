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
// Main just re-exports everything from mini
export * from "../mini/mod.ts";

// packages/package/mod.ts
// Top-level re-exports all main features
export * from "./src/core/main/mod.ts";
export * from "./src/utils/main/mod.ts";
```

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

// ⚠️ Acceptable - import from main (larger bundle)
import { isolate, eliminate } from "@sekhmet/enum/core";

// ❌ Avoid - imports everything (largest bundle)
import { isolate, eliminate } from "@sekhmet/enum";
```
