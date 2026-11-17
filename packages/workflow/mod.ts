/**
 * Workflow helpers: functions that mark the state of the code itself. `todo`
 * and `unimplemented` mark missing code, `unreachable` makes a `switch`
 * exhaustive, and `invariant`, `invariantEqual`, `defined` and `satisfies`
 * check what only a bug can break. Each panics
 * through `@sekhmet/panic` as `Panic (Todo)`, `Panic (Unimplemented)`,
 * `Panic (Unreachable)` or `Panic (Invariant)`, with a typed cause and a
 * type guard to recognize it.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { isTodoPanic, todo } from "@sekhmet/workflow";
 * import { assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * const unfinished: string[] = [];
 * runtime.setHook(({ payload }) => {
 *   if (isTodoPanic(payload)) unfinished.push(payload.name);
 * });
 *
 * runtime.catchUnwind(() => todo({ description: "export to CSV" }));
 *
 * assertEquals(unfinished, ["Panic (Todo)"]);
 * ```
 *
 * @module
 */

export * from "./src/invariant/mod.ts";
export * from "./src/todo/mod.ts";
export * from "./src/unreachable/mod.ts";
