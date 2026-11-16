/**
 * Sekhmet Schema - Type-safe validation and transformation library.
 *
 * This is the kitchen sink export that includes all schema functionality.
 * For tree-shakable imports, use the specific module paths:
 * - `@sekhmet/schema/core/mini` - Core schema utilities
 * - `@sekhmet/schema/primitives/mini` - Primitive type schemas
 * - `@sekhmet/schema/composites/mini` - Composite schemas (objects, arrays, unions…)
 * - `@sekhmet/schema/standard/mini` - The Standard Schema adapter
 *
 * @module
 */

export * from "./src/composites/main/mod.ts";
export * from "./src/core/main/mod.ts";
export * from "./src/primitives/main/mod.ts";
export * from "./src/standard/main/mod.ts";
