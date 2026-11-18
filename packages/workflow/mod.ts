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
 * ## How values are rendered
 *
 * The impossible value of `unreachable` and the offending values of the
 * invariant checks are rendered with a formatter that never throws:
 *
 * - strings are quoted, `-0` and BigInts (`10n`) are kept apart, symbols read
 *   as `Symbol(tag)`, functions as `[Function: name]`, errors as
 *   `[TypeError: message]`;
 * - objects, arrays, typed arrays, maps and sets are shown two levels deep
 *   and ten entries wide, as `{ a: 1 }`, `[1, <empty>, 3]`,
 *   `Uint8Array(3) [0, 0, 0]`, `Map(1) { "a" => 1 }` and `Set(1) { 1 }`, with
 *   a class instance prefixed by its class name and cycles shown as
 *   `[Circular]`;
 * - properties are read through their descriptors, so no getter runs (shown
 *   as `[Getter]`) and no `toJSON` or `toString` is called;
 * - strings and keys are cut at 200 characters
 *   (`"aaa…"… 4999800 more chars`), lists are read by index with their hidden
 *   entries counted from their length, and at most a hundred keys of an
 *   object are examined;
 * - anything that still throws, such as a revoked Proxy, renders as
 *   `[unrenderable value]`.
 *
 * Text passed in options (descriptions, subtasks, the expected behavior)
 * goes through `String`, falling back to the same formatter if that throws,
 * and is cut at a thousand characters.
 *
 * ## Options that cannot be read
 *
 * No option, however malformed, replaces the panic with another error:
 *
 * - a field that cannot be read renders as `[unrenderable value]`;
 * - a checklist that is not an array counts as empty;
 * - a URL that is not a `URL` is left out;
 * - an invariant check given no expected behavior says `(not given)`;
 * - `defined` given an `absent` it does not know counts `null` and
 *   `undefined` as absent;
 * - `satisfies` given a predicate that is not a function panics, as if the
 *   predicate rejected the value, and `invariantEqual` given an `equals` that
 *   is not a function panics, as if the values were unequal;
 * - `invariantEqual` given missing options, or an `actual` or `expected` that
 *   is missing or cannot be read, panics as unequal, with the value left out
 *   of the cause and shown as `[unrenderable value]`;
 * - if building the message still throws, the message is the header alone.
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
