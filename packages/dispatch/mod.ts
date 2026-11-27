/**
 * `@sekhmet/dispatch`: a typed, one-shot signal. It is
 * `AbortController`/`AbortSignal` with a typed value instead of
 * `reason: any`, and the same class shape.
 *
 * - **Two capabilities.** A {@linkcode DispatchController} can `dispatch`
 *   a value once; its {@linkcode DispatchSignal} can only be read. Hand out
 *   the signal and keep the controller.
 * - **The first dispatch wins.** `dispatch` returns the value already
 *   there, like Rust's `HashMap::insert`: `None` if this call dispatched,
 *   `Some(first)` if one had already happened. A listener's throw never
 *   reaches the caller.
 * - **Listeners never miss it.** A listener added after the dispatch runs
 *   at once (an `AbortSignal` silently never fires one added after the
 *   abort), and every listener returns an {@linkcode Unsubscribe}.
 * - **A throwing listener is a panic,** isolated by the
 *   `PanicBoundary` the controller was given (`{ panics }`) and reported to
 *   its runtime's hook, so the other listeners still run.
 * - **Signals compose and convert:** `map` (whose mapping runs once, and
 *   poisons the signal if it throws), `zip` and `DispatchSignal.any`
 *   derive signals that hold no subscription until someone listens, and
 *   `wait`, `toVow`, `toAbortSignal` and `DispatchSignal.fromAbortSignal`
 *   bridge to promises, vows and the platform.
 *
 * @example
 * ```ts
 * import { isNone, Some } from "@sekhmet/enum/option/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { DispatchController } from "@sekhmet/dispatch";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const cancel = new DispatchController<string>({ panics: definePanicRuntime() });
 * const heard: string[] = [];
 * cancel.signal.whenDispatched((reason) => {
 * 	heard.push(reason);
 * });
 * const forFetch = cancel.signal.toAbortSignal();
 *
 * assert(isNone(cancel.dispatch("user cancelled")));
 * assertEquals(cancel.dispatch("timed out"), Some("user cancelled"));
 * assertEquals(heard, ["user cancelled"]);
 * assertEquals(forFetch.reason, "user cancelled");
 * ```
 *
 * @module
 */

export { DispatchController } from "./src/controller.ts";
export {
	DispatchSignal,
	type Listener,
	type Unsubscribe,
} from "./src/signal.ts";
