# Library Template

A minimal library template with testing setup and common patterns.

## Structure

```txt
mod.ts       - Exported functions and types
mod.test.ts  - Test suite
deno.json    - Package configuration
```

## Testing Patterns

### Basic Test

```typescript
import { assertEquals } from "@std/assert";

Deno.test("function does what it should", () => {
	const result = myFunction(input);
	assertEquals(result, expected);
});
```

### Async Test

```typescript
import { assertEquals } from "@std/assert";

Deno.test("async function works", async () => {
	const result = await myAsyncFunction();
	assertEquals(result, expected);
});
```

### Test with Setup/Teardown

```typescript
Deno.test("test with cleanup", async (t) => {
	// Setup
	const tempDir = await Deno.makeTempDir();

	await t.step("perform operation", async () => {
		// Test logic
	});

	// Teardown
	await Deno.remove(tempDir, { recursive: true });
});
```

### Common Assertions

```typescript
import {
	assertEquals,
	assertExists,
	assertNotEquals,
	assertRejects,
	assertThrows,
} from "@std/assert";

// Equality
assertEquals(actual, expected);
assertNotEquals(actual, notExpected);

// Existence
assertExists(value);

// Errors
assertThrows(() => {
	throwingFunction();
}, Error, "expected message");

await assertRejects(async () => {
	await asyncThrowingFunction();
}, Error);
```

## Type Safety

### Exported Types

```typescript
// Export types for consumers
export interface MyConfig {
	name: string;
	value: number;
}

export type Result = "success" | "error";

// Use const assertions for type narrowing
export const CONSTANTS = {
	MAX_SIZE: 100,
	DEFAULT_NAME: "untitled",
} as const;
```

### Generic Functions

```typescript
export function identity<T>(value: T): T {
	return value;
}

export function mapArray<T, U>(
	array: T[],
	fn: (item: T) => U,
): U[] {
	return array.map(fn);
}
```

## Running Tests

```bash
# Run all tests
deno test

# Run with coverage
deno test --coverage

# Run specific test file
deno test mod.test.ts

# Watch mode
deno test --watch
```
