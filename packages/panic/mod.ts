/**
 * Rust-style panics for TypeScript: a structured `Panic` for broken
 * invariants, and a panic runtime that splits reporting (the panic hook) from
 * recovery (`catchUnwind`), with no global state.
 *
 * Each Rust `std::panic` item maps to a counterpart here:
 *
 * | Rust (`std::panic`) | `@sekhmet/panic`                                   |
 * | ------------------- | -------------------------------------------------- |
 * | `panic!`            | `panic(source)` / `panicWithoutCause(source)`      |
 * | `set_hook`          | `runtime.setHook(hook)`                            |
 * | `take_hook`         | `runtime.takeHook()` (restores `defaultPanicHook`) |
 * | `PanicHookInfo`     | `PanicHookInfo` (`payload`, `stack`)               |
 * | `catch_unwind`      | `runtime.catchUnwind(fn)` / `catchUnwindAsync(fn)` |
 * | `thread::Result`    | `Outcome` (`@sekhmet/panic/outcome`)               |
 * | `resume_unwind`     | `runtime.resumeUnwind(payload)`                    |
 * | `Box<dyn Any>`      | `unknown`                                          |
 *
 * Two behaviors differ. With no global hook, the hook runs at a runtime's
 * boundary rather than at the throw, once per runtime. With no portable abort
 * in JavaScript, a hook that throws makes the boundary throw a
 * `Panic (PanicHook)` instead of aborting the process.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Ok } from "@sekhmet/panic/outcome/mini";
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
