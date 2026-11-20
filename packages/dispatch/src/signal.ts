/**
 * The read side of a dispatch: {@linkcode DispatchSignal}, like
 * `AbortSignal` with a typed value, and its combinators and conversions.
 *
 * A signal is a pair `{ poll, listen }` held in a private field. A derived
 * signal (`map`, `zip`, `any`, `fromAbortSignal`) holds no listeners of its
 * own: `listen` forwards each listener to its sources and `poll` reads
 * them. So a derived signal that nobody listens to holds no subscription,
 * and each listener runs inside its root's `catchUnwind` boundary.
 *
 * @module
 */

import { isolate, union } from "@sekhmet/enum/core/mini";
import { Pending, type Poll, Ready } from "@sekhmet/enum/poll/mini";
import type { PanicRuntime } from "@sekhmet/panic";
import { type Vow, vowWithResolver } from "@sekhmet/vow/mini";

/**
 * Stops a listener before it runs. It returns `true` if it removed the
 * listener, and `false` if the listener had already run or been removed.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { DispatchController, type Unsubscribe } from "@sekhmet/dispatch";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const controller = new DispatchController<string>(
 * 	definePanicRuntime().catchUnwind,
 * );
 * const heard: string[] = [];
 * const stop: Unsubscribe = controller.signal.whenDispatched((value) => {
 * 	heard.push(value);
 * });
 *
 * assert(stop());
 * controller.dispatch("ignored");
 * assertEquals(heard, []);
 * assertEquals(stop(), false);
 * ```
 */
export type Unsubscribe = () => boolean;

/**
 * A listener for a dispatched value. It runs once, with the value.
 *
 * @template T The type of the dispatched value
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { DispatchController, type Listener } from "@sekhmet/dispatch";
 * import { assertEquals } from "@std/assert";
 *
 * const heard: number[] = [];
 * const record: Listener<number> = (value) => {
 * 	heard.push(value);
 * };
 * const controller = new DispatchController<number>(
 * 	definePanicRuntime().catchUnwind,
 * );
 * controller.signal.whenDispatched(record);
 *
 * controller.dispatch(7);
 * assertEquals(heard, [7]);
 * ```
 */
export type Listener<T> = (value: T) => void;

/**
 * The only part of a panic runtime a dispatch needs: a boundary that
 * isolates and reports a throw. Pass `runtime.catchUnwind`.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { type CatchUnwind, DispatchController } from "@sekhmet/dispatch";
 *
 * const runtime = definePanicRuntime();
 * const catchUnwind: CatchUnwind = runtime.catchUnwind;
 * const controller = new DispatchController<string>(catchUnwind);
 * controller.dispatch("done");
 * ```
 */
export type CatchUnwind = PanicRuntime["catchUnwind"];

/**
 * Proves a `DispatchSignal` is built inside this package. The package's
 * entrypoint never exports it, so no outside code can build one.
 *
 * @internal
 */
export const BUILT_HERE: unique symbol = Symbol("DispatchSignal");

/**
 * What a signal is: how to read it now, and how to hear it later. It uses
 * `T` only covariantly. `listen` runs a listener at once (inside a boundary)
 * when the signal has already dispatched.
 *
 * @internal
 */
export interface SignalSource<T> {
	/** `Ready(value)` once dispatched, `Pending` before. */
	readonly poll: () => Poll<T>;
	/** Runs `listener` with the value once dispatched, or at once if it has. */
	readonly listen: (listener: Listener<T>) => Unsubscribe;
}

/**
 * The read side of a dispatch, like `AbortSignal` with a typed value instead
 * of `reason: any`: listen to it, poll it or convert it, but never dispatch
 * it. Hand out the signal and keep its {@linkcode DispatchController}.
 *
 * Like `AbortSignal`, it has no public constructor: a signal comes from a
 * controller, a combinator (`map`, `zip`, `any`) or a static (`dispatched`,
 * `never`, `fromAbortSignal`). It is covariant in `T`, so a
 * `DispatchSignal<"done">` is a `DispatchSignal<string>`.
 *
 * @template T The type of the dispatched value
 *
 * @example
 * ```ts
 * import { Ready } from "@sekhmet/enum/poll/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { DispatchController, type DispatchSignal } from "@sekhmet/dispatch";
 * import { assertEquals } from "@std/assert";
 *
 * type Cause = "done" | "cancelled";
 *
 * const controller = new DispatchController<Cause>(
 * 	definePanicRuntime().catchUnwind,
 * );
 * const signal: DispatchSignal<Cause> = controller.signal;
 * const heard: Cause[] = [];
 * signal.whenDispatched((cause) => {
 * 	heard.push(cause);
 * });
 *
 * controller.dispatch("cancelled");
 * assertEquals(heard, ["cancelled"]);
 * assertEquals(signal.poll(), Ready("cancelled"));
 * ```
 */
export class DispatchSignal<out T> {
	readonly #source: SignalSource<T>;

	/**
	 * Not for use: it throws a `TypeError`, like `new AbortSignal()`. Get a
	 * signal from a {@linkcode DispatchController}, a combinator or a static.
	 *
	 * @param token The package's private token
	 * @param source How to poll and listen to the signal
	 */
	constructor(token: typeof BUILT_HERE, source: SignalSource<T>) {
		if (token !== BUILT_HERE) {
			throw new TypeError(
				"Illegal constructor: get a DispatchSignal from a DispatchController",
			);
		}
		this.#source = source;
	}

	/**
	 * Reads the signal now: `Ready(value)` once dispatched, `Pending` before.
	 * It never subscribes.
	 *
	 * @returns `Ready` of the dispatched value, or `Pending`
	 *
	 * @example
	 * ```ts
	 * import { isPending, Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const controller = new DispatchController<number>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * assert(isPending(controller.signal.poll()));
	 *
	 * controller.dispatch(1);
	 * assertEquals(controller.signal.poll(), Ready(1));
	 * ```
	 */
	poll(): Poll<T> {
		return this.#source.poll();
	}

	/**
	 * Calls `listener` with the value once the signal dispatches, or at once
	 * if it already has (an `AbortSignal` listener added after the abort
	 * never fires). A listener added while the signal is dispatching runs
	 * after the ones already waiting. A throwing listener is isolated by the
	 * root's `catchUnwind` and reported to its hook; the others still run.
	 *
	 * @param listener Runs once, with the dispatched value
	 * @returns A function that removes the listener if it hasn't run yet
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const controller = new DispatchController<string>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * controller.dispatch("gone");
	 *
	 * let heard: string | undefined;
	 * controller.signal.whenDispatched((value) => {
	 * 	heard = value;
	 * });
	 * assertEquals(heard, "gone");
	 * ```
	 */
	whenDispatched(listener: Listener<T>): Unsubscribe {
		return this.#source.listen(listener);
	}

	/**
	 * The value as a `Promise`. It subscribes until the dispatch, so a signal
	 * that never dispatches keeps its listener.
	 *
	 * @returns A promise of the dispatched value
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const controller = new DispatchController<string>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * const waiting = controller.signal.wait();
	 *
	 * controller.dispatch("ready");
	 * assertEquals(await waiting, "ready");
	 * ```
	 */
	wait(): Promise<T> {
		return new Promise((resolve) => {
			this.whenDispatched(resolve);
		});
	}

	/**
	 * A new `Vow` of the value, which resolves synchronously inside the
	 * dispatch. Each call makes its own vow. It subscribes until the
	 * dispatch.
	 *
	 * @returns A vow that resolves with the dispatched value
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { isResolved } from "@sekhmet/vow/mini";
	 * import { assert } from "@std/assert";
	 *
	 * const controller = new DispatchController<number>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * const vow = controller.signal.toVow();
	 *
	 * controller.dispatch(42);
	 * assert(isResolved(vow));
	 * ```
	 */
	toVow(): Vow<T> {
		const { vow, resolve } = vowWithResolver<T>();
		this.whenDispatched(resolve);
		return vow;
	}

	/**
	 * An `AbortSignal` that aborts with the dispatched value as its reason,
	 * for `fetch` and other platform APIs. It subscribes until the dispatch.
	 *
	 * @returns A platform signal that aborts when this one dispatches
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const cancel = new DispatchController<string>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * const forFetch = cancel.signal.toAbortSignal();
	 *
	 * cancel.dispatch("user cancelled");
	 * assert(forFetch.aborted);
	 * assertEquals(forFetch.reason, "user cancelled");
	 * ```
	 */
	toAbortSignal(): AbortSignal {
		const controller = new AbortController();
		this.whenDispatched((reason) => {
			controller.abort(reason);
		});
		return controller.signal;
	}

	/**
	 * A signal that dispatches `mapping(value)` when this one dispatches.
	 * `mapping` runs once, however many listeners and polls read it.
	 *
	 * @template U The type of the mapped value
	 * @param mapping Turns the dispatched value into the new one
	 * @returns The mapped signal
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const port = new DispatchController<number>(
	 * 	definePanicRuntime().catchUnwind,
	 * );
	 * const label = port.signal.map((n) => `port ${n}`);
	 *
	 * port.dispatch(8080);
	 * assertEquals(label.poll(), Ready("port 8080"));
	 * ```
	 */
	map<U>(mapping: (value: T) => U): DispatchSignal<U> {
		const source = this.#source;
		let memo: { readonly value: U } | undefined;
		const mapped = (value: T): U => {
			memo ??= { value: mapping(value) };
			return memo.value;
		};
		return new DispatchSignal(BUILT_HERE, {
			poll: () => {
				const polled = source.poll();
				if (isolate(polled, "Ready")) {
					return Ready(mapped(union(polled)));
				}
				return Pending();
			},
			listen: (listener) => {
				return source.listen((value) => {
					listener(mapped(value));
				});
			},
		});
	}

	/**
	 * A signal that dispatches both values, as a pair, once both this signal
	 * and `other` have dispatched.
	 *
	 * @template U The type of the other signal's value
	 * @param other The signal to pair with
	 * @returns A signal of `[this value, other value]`
	 *
	 * @example
	 * ```ts
	 * import { isPending, Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const { catchUnwind } = definePanicRuntime();
	 * const host = new DispatchController<string>(catchUnwind);
	 * const port = new DispatchController<number>(catchUnwind);
	 * const address = host.signal.zip(port.signal);
	 *
	 * host.dispatch("localhost");
	 * assert(isPending(address.poll()));
	 * port.dispatch(8080);
	 * assertEquals(address.poll(), Ready(["localhost", 8080] as const));
	 * ```
	 */
	zip<U>(other: DispatchSignal<U>): DispatchSignal<readonly [T, U]> {
		const self = this.#source;
		const that = other.#source;
		let memo: readonly [T, U] | undefined;
		const paired = ({ a, b }: { a: T; b: U }): readonly [T, U] => {
			memo ??= [a, b];
			return memo;
		};
		return new DispatchSignal(BUILT_HERE, {
			poll: () => {
				const a = self.poll();
				const b = that.poll();
				if (isolate(a, "Ready") && isolate(b, "Ready")) {
					return Ready(paired({ a: union(a), b: union(b) }));
				}
				return Pending();
			},
			listen: (listener) => {
				let stopB: Unsubscribe | undefined;
				const stopA = self.listen((a) => {
					stopB = that.listen((b) => {
						listener(paired({ a, b }));
					});
				});
				return () => (stopB ?? stopA)();
			},
		});
	}

	/**
	 * A signal that dispatches with the first of `signals` to dispatch, like
	 * `AbortSignal.any`. Each listener lets go of the other sources once one
	 * dispatches. Since it holds no subscription while nobody listens, it
	 * sees the race only through its listeners: among sources already
	 * dispatched when it is first read (polled or listened to), the earliest
	 * in `signals` wins. `any([])` never dispatches.
	 *
	 * @template T The type of the dispatched value
	 * @param signals The signals to race
	 * @returns A signal of the first value dispatched
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const { catchUnwind } = definePanicRuntime();
	 * const timeout = new DispatchController<string>(catchUnwind);
	 * const user = new DispatchController<string>(catchUnwind);
	 * const stop = DispatchSignal.any([timeout.signal, user.signal]);
	 * const heard: string[] = [];
	 * stop.whenDispatched((reason) => {
	 * 	heard.push(reason);
	 * });
	 *
	 * user.dispatch("user pressed stop");
	 * timeout.dispatch("timed out");
	 * assertEquals(heard, ["user pressed stop"]);
	 * assertEquals(stop.poll(), Ready("user pressed stop"));
	 * ```
	 */
	static any<T>(signals: readonly DispatchSignal<T>[]): DispatchSignal<T> {
		const sources = signals.map((signal) => signal.#source);
		let decided:
			| { readonly winner: SignalSource<T>; readonly value: T }
			| undefined;
		const decide = ({
			winner,
			value,
		}: {
			winner: SignalSource<T>;
			value: T;
		}): T => {
			decided ??= { winner, value };
			return decided.value;
		};
		const poll = (): Poll<T> => {
			if (decided === undefined) {
				for (const source of sources) {
					const polled = source.poll();
					if (isolate(polled, "Ready")) {
						decide({ winner: source, value: union(polled) });
						break;
					}
				}
			}
			if (decided === undefined) {
				return Pending();
			}
			return Ready(decided.value);
		};
		return new DispatchSignal(BUILT_HERE, {
			poll,
			listen: (listener) => {
				poll();
				if (decided !== undefined) {
					const { winner, value } = decided;
					// The winner runs it now, inside its own boundary.
					return winner.listen(() => {
						listener(value);
					});
				}
				let fired = false;
				const stops: Unsubscribe[] = [];
				for (const source of sources) {
					stops.push(
						source.listen((value) => {
							fired = true;
							for (const stop of stops) {
								stop();
							}
							listener(decide({ winner: source, value }));
						}),
					);
				}
				return () => {
					for (const stop of stops) {
						stop();
					}
					return !fired && stops.length > 0;
				};
			},
		});
	}

	/**
	 * A signal already dispatched with `value`, like
	 * `AbortSignal.abort(reason)`. Its listeners run at once, inside
	 * `catchUnwind`.
	 *
	 * @template T The type of the value
	 * @param options The value, and the boundary its listeners run in
	 * @returns A signal that has already dispatched
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchSignal } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const done = DispatchSignal.dispatched({
	 * 	value: "done",
	 * 	catchUnwind: definePanicRuntime().catchUnwind,
	 * });
	 * assertEquals(done.poll(), Ready("done"));
	 * ```
	 */
	static dispatched<T>({
		value,
		catchUnwind,
	}: {
		readonly value: T;
		readonly catchUnwind: CatchUnwind;
	}): DispatchSignal<T> {
		return new DispatchSignal(BUILT_HERE, {
			poll: () => Ready(value),
			listen: (listener) => {
				catchUnwind(() => listener(value));
				return () => false;
			},
		});
	}

	/**
	 * A signal that never dispatches. It never holds its listeners, so
	 * listening to it costs nothing.
	 *
	 * @template T The type it would dispatch, `never` by default
	 * @returns A signal that stays pending
	 *
	 * @example
	 * ```ts
	 * import { isPending } from "@sekhmet/enum/poll/mini";
	 * import { DispatchSignal } from "@sekhmet/dispatch";
	 * import { assert } from "@std/assert";
	 *
	 * const forever = DispatchSignal.never<string>();
	 * assert(isPending(forever.poll()));
	 * ```
	 */
	static never<T = never>(): DispatchSignal<T> {
		return new DispatchSignal<T>(BUILT_HERE, {
			poll: () => Pending(),
			listen: () => () => false,
		});
	}

	/**
	 * A signal that dispatches with an `AbortSignal`'s reason when it aborts.
	 * It adds a platform listener only while it has listeners of its own,
	 * and runs them inside `catchUnwind`.
	 *
	 * @param options The platform signal, and the boundary listeners run in
	 * @returns A signal of the abort reason
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { DispatchSignal } from "@sekhmet/dispatch";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const platform = new AbortController();
	 * const closed = DispatchSignal.fromAbortSignal({
	 * 	signal: platform.signal,
	 * 	catchUnwind: definePanicRuntime().catchUnwind,
	 * });
	 *
	 * platform.abort("socket closed");
	 * assertEquals(closed.poll(), Ready("socket closed"));
	 * ```
	 */
	static fromAbortSignal({
		signal,
		catchUnwind,
	}: {
		readonly signal: AbortSignal;
		readonly catchUnwind: CatchUnwind;
	}): DispatchSignal<unknown> {
		return new DispatchSignal<unknown>(BUILT_HERE, {
			poll: () => {
				if (signal.aborted) {
					return Ready(signal.reason);
				}
				return Pending();
			},
			listen: (listener) => {
				if (signal.aborted) {
					catchUnwind(() => listener(signal.reason));
					return () => false;
				}
				let waiting = true;
				const onAbort = (): void => {
					waiting = false;
					catchUnwind(() => listener(signal.reason));
				};
				signal.addEventListener("abort", onAbort, { once: true });
				return () => {
					const was = waiting;
					waiting = false;
					signal.removeEventListener("abort", onAbort);
					return was;
				};
			},
		});
	}
}
