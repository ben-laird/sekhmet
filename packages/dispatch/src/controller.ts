/**
 * The write side of a dispatch: {@linkcode DispatchController}, like
 * `AbortController`, paired with its {@linkcode DispatchSignal}.
 *
 * @module
 */

import { isolate, union } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { Pending, type Poll, Ready } from "@sekhmet/enum/poll/mini";
import type { PanicBoundary } from "@sekhmet/panic";
import { invariant } from "@sekhmet/workflow/invariant";
import { BUILT_HERE, DispatchSignal, type Listener } from "./signal.ts";

/**
 * The write side of a dispatch, like `AbortController`: it dispatches a
 * typed value once, and its {@linkcode DispatchController.signal} is the
 * read side to hand out.
 *
 * Its listeners run inside the panic boundary it was given, so a throwing
 * listener is reported to that runtime's hook, the other listeners still
 * run, and `dispatch` doesn't throw for it. Only a hook that throws while
 * reporting (a double fault) propagates.
 *
 * @template T The type of the dispatched value
 *
 * @example
 * ```ts
 * import { isNone, Some } from "@sekhmet/enum/option/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { DispatchController } from "@sekhmet/dispatch";
 * import { assert, assertEquals } from "@std/assert";
 *
 * type Cause =
 * 	| { readonly kind: "done" }
 * 	| { readonly kind: "cancelled"; readonly by: string };
 * // {}
 *
 * const controller = new DispatchController<Cause>({ panics: definePanicRuntime() });
 * const heard: Cause[] = [];
 * controller.signal.whenDispatched((cause) => {
 * 	heard.push(cause);
 * });
 *
 * assert(isNone(controller.dispatch({ kind: "cancelled", by: "user" })));
 * assertEquals(
 * 	controller.dispatch({ kind: "done" }),
 * 	Some({ kind: "cancelled", by: "user" }),
 * );
 * assertEquals(heard, [{ kind: "cancelled", by: "user" }]);
 * ```
 */
export class DispatchController<T> {
	/**
	 * The read side to hand out: it can be listened to and polled, never
	 * dispatched.
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController, type DispatchSignal } from "@sekhmet/dispatch";
	 *
	 * const controller = new DispatchController<string>({ panics: definePanicRuntime() });
	 * const signal: DispatchSignal<string> = controller.signal;
	 * signal.whenDispatched(() => {});
	 * ```
	 */
	readonly signal: DispatchSignal<T>;
	readonly #dispatch: (value: T) => Option<T>;

	/**
	 * A controller whose listeners run inside the panic boundary `panics`,
	 * such as `new DispatchController<T>({ panics: runtime })`. A listener
	 * runs on the dispatcher's stack, not its subscriber's, so no caller of
	 * its own waits on it.
	 *
	 * @param options `panics`, the boundary each listener runs in, which
	 *   reports a throw to its runtime's hook
	 */
	constructor({ panics }: { readonly panics: PanicBoundary }) {
		let state: Poll<T> = Pending();
		// Listeners still to run: before the dispatch, and while it drains.
		let waiting: Set<Listener<T>> | undefined = new Set();

		const run = ({
			listener,
			value,
		}: {
			listener: Listener<T>;
			value: T;
		}): void => {
			panics.catchUnwind(() => listener(value));
		};

		this.signal = new DispatchSignal({
			token: BUILT_HERE,
			source: {
				poll: () => state,
				listen: (listener) => {
					if (waiting !== undefined) {
						// A listener added mid-dispatch joins the queue, keeping order.
						const queue = waiting;
						queue.add(listener);
						return () => queue.delete(listener);
					}
					if (isolate(state, "Ready")) {
						run({ listener, value: union(state) });
					}
					return () => false;
				},
			},
		});

		this.#dispatch = (value) => {
			if (isolate(state, "Ready")) {
				return Some(union(state));
			}
			invariant(waiting !== undefined, {
				expectedBehavior:
					"a dispatch controller should hold its waiting listeners until it dispatches",
			});
			state = Ready(value);
			const queue = waiting;
			// A double fault (a throwing hook) still lets every listener run and the queue drain.
			let doubleFault: { readonly thrown: unknown } | undefined;
			for (const listener of queue) {
				// A Set visits entries added during iteration, so late joiners run too.
				queue.delete(listener);
				try {
					run({ listener, value });
				} catch (thrown: unknown) {
					doubleFault ??= { thrown };
				}
			}
			waiting = undefined;
			if (doubleFault !== undefined) {
				throw doubleFault.thrown;
			}
			return None();
		};
	}

	/**
	 * Dispatches `value`, once. It returns the value already there, like
	 * Rust's `HashMap::insert`: `None` if this call dispatched, and
	 * `Some(first)` if an earlier call had. A throwing listener is reported
	 * through the boundary, never thrown to the caller.
	 *
	 * The one exception is a double fault: if the panic hook itself throws
	 * while reporting a listener's throw, the boundary throws a panic. The
	 * dispatch still completes first (every queued listener runs, in order,
	 * and later listeners run at once as usual), then `dispatch` rethrows the
	 * first such panic.
	 *
	 * @param value The value to dispatch
	 * @returns `None` if this call dispatched, or `Some` of the earlier value
	 * @throws The panic from a throwing panic hook (a double fault)
	 *
	 * @example
	 * ```ts
	 * import { isNone, Some } from "@sekhmet/enum/option/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const controller = new DispatchController<string>({ panics: definePanicRuntime() });
	 * assert(isNone(controller.dispatch("first")));
	 * assertEquals(controller.dispatch("second"), Some("first"));
	 * ```
	 */
	dispatch(value: T): Option<T> {
		return this.#dispatch(value);
	}
}
