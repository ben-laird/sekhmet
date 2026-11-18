/**
 * Workflow helpers: functions that mark the state of the code itself. `todo`
 * and `unimplemented` mark missing code, `unreachable` makes a `switch`
 * exhaustive, and `invariant`, `invariantEqual`, `defined` and `satisfies`
 * check what only a bug can break. Each panics through `@sekhmet/panic`,
 * with a typed cause and a type guard to recognize it:
 *
 * | Helper           | Panics as               | Cause                | Guard                  |
 * | ---------------- | ----------------------- | -------------------- | ---------------------- |
 * | `todo`           | `Panic (Todo)`          | `TodoCause`          | `isTodoPanic`          |
 * | `unimplemented`  | `Panic (Unimplemented)` | `UnimplementedCause` | `isUnimplementedPanic` |
 * | `unreachable`    | `Panic (Unreachable)`   | `UnreachableCause`   | `isUnreachablePanic`   |
 * | `invariant`      | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
 * | `invariantEqual` | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
 * | `defined`        | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
 * | `satisfies`      | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
 *
 * The name is always the helper's own, even when the options object carries
 * extra fields at runtime. Every message opens with a header line; the lines
 * after it appear only when their part was given, so `todo()`,
 * `unimplemented()` and `unreachable()` without options panic with the header
 * alone.
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
