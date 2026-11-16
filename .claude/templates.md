# Code Templates

Quick-reference templates for common Sekhmet patterns.

## New Feature with Dual Exports

### 1. Create the mini implementation

**File**: `packages/package-name/src/feature/mini/myFunction.ts`

```ts ignore
import { Struct, getStructParams } from "@sekhmet/primordials/struct";

/**
 * Brief description of what this function does
 * @param param1 Description of first parameter
 * @returns Description of return value
 */
export function myFunction<T>(param1: T): ReturnType {
	// Implementation
	return result;
}
```

### 2. Export from mini barrel

**File**: `packages/package-name/src/feature/mini/mod.ts`

```ts ignore
export * from "./myFunction.ts";
export * from "./otherFunction.ts";
```

### 3. Generate the main module

Add the feature to `FEATURES` in `scripts/gen-main/src/config.ts`, then run
`deno task gen:main`. It writes `packages/package-name/src/feature/main/mod.ts`;
commit it with the mini source.

### 4. Update package deno.json

**File**: `packages/package-name/deno.json`

```json
{
	"name": "@sekhmet/package-name",
	"version": "0.1.0",

	"exports": {
		".": "./mod.ts",
		"./feature": "./src/feature/main/mod.ts",
		"./feature/mini": "./src/feature/mini/mod.ts",
		"./feature/mini/myFunction": "./src/feature/mini/myFunction.ts"
	},

	"imports": {
		"@/": "./"
	}
}
```

## BDD Test Template

**File**: `feature.test.ts` (next to `feature.ts`)

```ts ignore
import { assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import * as TestSubject from "./feature.ts";

Deno.test("function handles basic case", () => {
	// Given - Setup test data and preconditions
	const input = "test value";
	const expected = "expected result";

	// When - Execute the behavior being tested
	const result = TestSubject.myFunction(input);

	// Then - Assert expected outcomes
	assertEquals(result, expected);
});

Deno.test("function validates types correctly", async (t) => {
	// Given
	const input = setupComplexData();

	// When
	const result = TestSubject.myFunction(input);

	// Then
	await t.step("validates output type", () => {
		assertType<IsExact<typeof result, ExpectedType>>(true);
	});

	await t.step("validates output value", () => {
		assertEquals(result, expectedValue);
	});
});

Deno.test("function throws on invalid input", () => {
	// Given
	const invalidInput = null;

	// When/Then
	assertThrows(
		() => TestSubject.myFunction(invalidInput),
		Error,
		"Expected error message",
	);
});
```

## Enum Variant Definition

### Basic variant types

```ts ignore
import { Enum, type Split } from "@sekhmet/enum/core/mini";

// Using Split for ergonomic variant definition
type MyVariants = Split<{
	Success: [value: string];
	Error: [error: Error];
	Pending: []; // No value variant
}>;

// Create a custom enum class
class MyEnum extends Enum<MyVariants> {}

// Usage
const success = new MyEnum("Success", "Hello!");
const error = new MyEnum("Error", new Error("Failed"));
const pending = new MyEnum("Pending");
```

### Manual variant definition (without Split)

```ts ignore
import { Enum, type SomeVariant } from "@sekhmet/enum/core/mini";

type MyVariants =
	| [kind: "Success", value: string]
	| [kind: "Error", error: Error]
	| [kind: "Pending"];

class MyEnum extends Enum<MyVariants> {}
```

## Working with Struct

### Creating a Struct wrapper

```ts ignore
import { Struct, getStructParams } from "@sekhmet/primordials/struct";

// Define the internal structure
interface MyData {
	field1: string;
	field2: number;
}

// Create a class that extends Struct
class MyWrapper extends Struct<MyData> {
	constructor(field1: string, field2: number) {
		super({ field1, field2 });
	}
}

// Usage
const wrapper = new MyWrapper("hello", 42);

// Access internal data
const data = getStructParams(wrapper);
console.log(data.field1); // "hello"
```

## Working with Subtle

### Creating subtle functionality

```ts ignore
import { Subtle, useSubtle, type Creator } from "@sekhmet/primordials/subtle";

// Define what the subtle functionality creates
interface Controller {
	start(): void;
	stop(): void;
}

// Create a subtle wrapper
const createController: Creator<Controller, [name: string]> = (name) => ({
	start: () => console.log(`${name} started`),
	stop: () => console.log(`${name} stopped`),
});

const subtleController = new Subtle({ create: createController });

// Use the subtle functionality
const controller = useSubtle(subtleController, "MyController");
controller.start(); // "MyController started"
```

## Enum Pattern Matching

```ts ignore
import { match, unionKinds } from "@sekhmet/enum/core/mini";

type Result = Split<{
	Ok: [value: number];
	Err: [error: string];
}>;

class ResultEnum extends Enum<Result> {}

const result = new ResultEnum("Ok", 42);

// Pattern matching with match()
const message = match(result)({
	Ok: (value) => `Success: ${value}`,
	Err: (error) => `Failed: ${error}`,
});

// Or check kinds directly
const kind = unionKinds(result); // "Ok" | "Err"
```

## Function with isolatedDeclarations

**All exported functions need explicit return types**:

```ts ignore
// ✅ Good - explicit return type
export function myFunction<T>(input: T): string {
	return input.toString();
}

// ✅ Good - explicit complex return type
export function processData<T extends SomeVariant>(
	data: Enum<T>,
): { kind: Kinds<T>; value: Values<T> } {
	return {
		kind: unionKinds(data),
		value: union(data),
	};
}

// ❌ Bad - inferred return type
export function myFunction<T>(input: T) {
	return input.toString();
}
```

## JSDoc Comments

```ts ignore
/**
 * Brief one-line description of what this does
 *
 * Longer description if needed, explaining behavior, edge cases, or usage
 * patterns. This can span multiple lines.
 *
 * @param self - The enum to check
 * @param kind - The variant kind to isolate
 * @returns Type predicate indicating if the enum matches the kind
 *
 * @example
 * ```ts
 * const result = new ResultEnum("Ok", 42);
 * if (isolate(result, "Ok")) {
 *   // result is narrowed to Enum<Isolate<Result, "Ok">>
 * }
 * ```
 */
export function isolate<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): self is Enum<Isolate<T, K>> {
	return unionKinds(self) === kind;
}
```

## New Package Structure

### Small package (single feature)

```txt
package-name/
├── mod.ts           # Main exports
├── mod.test.ts      # Tests
├── deno.json        # Package config
└── README.md
```

### Medium package (multiple features)

```txt
package-name/
├── src/
│   ├── feature1/
│   │   ├── mod.ts
│   │   └── mod.test.ts
│   └── feature2/
│       ├── mod.ts
│       └── mod.test.ts
├── mod.ts           # Top-level re-exports
├── deno.json
└── README.md
```

### Large package (dual exports)

```txt
package-name/
├── src/
│   ├── core/
│   │   ├── main/mod.ts
│   │   └── mini/
│   │       ├── mod.ts
│   │       ├── feature1.ts
│   │       ├── feature1.test.ts
│   │       ├── feature2.ts
│   │       └── feature2.test.ts
│   └── other-feature/
│       ├── main/mod.ts
│       └── mini/
├── mod.ts
├── deno.json
└── README.md
```
