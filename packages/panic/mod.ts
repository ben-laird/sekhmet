/**
 * Rust-style panics for TypeScript: a structured `Panic` for broken
 * invariants, and a panic runtime that splits reporting (the panic hook) from
 * recovery (`catchUnwind`), with no global state.
 *
 * @example
 * ```ts ignore
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const runtime = definePanicRuntime();
 * const result = runtime.catchUnwind(main);
 * ```
 *
 * @module
 */

export * from "./src/mini/mod.ts";
