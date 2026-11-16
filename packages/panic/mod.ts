/**
 * Rust-style panics for TypeScript: a structured `Panic` for broken
 * invariants, and a panic runtime that splits reporting (the panic hook) from
 * recovery (`catchUnwind`), with no global state.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Ok } from "@sekhmet/enum/result/mini/core";
 * import { assertEquals } from "@std/assert";
 *
 * const main = (): number => 42;
 *
 * const runtime = definePanicRuntime();
 * const result = runtime.catchUnwind(main);
 *
 * assertEquals(result, Ok(42));
 * ```
 *
 * @module
 */

export * from "./src/mini/mod.ts";
