/**
 * The falling edge: {@linkcode Lifetime}, which holds a value from birth and
 * guarantees its teardown, once, in reverse acquisition order.
 *
 * @module
 */

import {
	DispatchController,
	type DispatchSignal,
	type Unsubscribe,
} from "@sekhmet/dispatch";
import { isolate, match, union } from "@sekhmet/enum/core/mini";
import { None, type Option, Some } from "@sekhmet/enum/option/mini";
import { expectReady } from "@sekhmet/enum/poll/mini";
import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { type Panic, type PanicBoundary, panic } from "@sekhmet/panic";
import {
	isPanicked,
	unwrap as unwrapOutcome,
	unwrapPanicked,
} from "@sekhmet/panic/outcome/mini";
import { block } from "@sekhmet/primordials/scoping";
import {
	map,
	poll,
	resolved,
	type Vow,
	value as vowValue,
} from "@sekhmet/vow/mini";
import { invariant } from "@sekhmet/workflow/invariant";
import { Adoption } from "./adoption.ts";
import { causeOf, type EndReport, Phase } from "./phase.ts";
import { Registration } from "./registration.ts";
import {
	asPanic,
	installDisposers,
	runCleanup,
	throwIfFailed,
} from "./teardown.ts";

/**
 * A cleanup, given the cause the lifetime ended with. It is synchronous, or
 * returns a promise (closing a database connection) that the teardown
 * awaits before it runs the next entry.
 *
 * @template C The type of the cause
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { type Cleanup, Lifetime } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * const closed: string[] = [];
 * const close: Cleanup<string> = async (cause) => {
 * 	await Promise.resolve();
 * 	closed.push(cause);
 * };
 * const lifetime = new Lifetime<undefined, string>({
 * 	value: undefined,
 * 	panics: definePanicRuntime(),
 * });
 * lifetime.defer(close);
 *
 * await lifetime.end("shutdown").wait();
 * assertEquals(closed, ["shutdown"]);
 * ```
 */
export type Cleanup<C> = (cause: C) => void | PromiseLike<void>;

/**
 * One entry on the teardown stack: a cleanup or an adopted child. `run`
 * never throws; a synchronous double fault goes to `onDoubleFault`, and its
 * panic still comes back in the list.
 */
interface Entry<C> {
	readonly run: (options: {
		readonly cause: C;
		readonly onDoubleFault: (thrown: unknown) => void;
	}) => Vow<readonly Panic<unknown>[]>;
}

/** A lifetime's owner, as the child sees it. */
interface OwnerLink<out C> {
	/** The owning lifetime, for cycle checks */
	readonly owner: object;
	/** The owner's own owner */
	readonly up: () => OwnerLink<unknown> | undefined;
	/**
	 * The child leaves its owner as it starts ending on its own. The owner's
	 * stack keeps a waiter until the child's teardown has finished.
	 */
	readonly leave: () => void;
	/**
	 * The owner's dispose cause, mapped into the child's, read when needed;
	 * `Err` when a `fromParent` on the way panics
	 */
	readonly disposeCause: () => Result<Option<C>, Panic<unknown>>;
}

/**
 * A lifetime holding a `T` from birth, ended once with a cause `C`: the
 * falling edge of RAII. It is `Alive(value)` until `end(cause)`, then
 * `Ending(cause)` while its teardown runs, then `Ended(report)`.
 *
 * Teardown is one stack, run in reverse acquisition order: the cleanups
 * registered with `defer` and the children adopted with `adopt` share it,
 * so whatever was acquired last is released first.
 *
 * `Lifetime` is invariant in `C`, since `end` takes a `C`: a lifetime of a
 * narrow cause can't stand in for one of a wider cause.
 *
 * Its two transitions are {@linkcode DispatchSignal}s, so listeners never
 * miss them, and its phase is read from them, never kept by hand.
 *
 * @template T The type of the value it holds
 * @template C The type of the cause it ends with
 *
 * @example
 * ```ts
 * import { None, Some } from "@sekhmet/enum/option/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Lifetime } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * type Cause = "done" | "cancelled";
 *
 * const app = new Lifetime<undefined, Cause>({
 * 	value: undefined,
 * 	panics: definePanicRuntime(),
 * });
 * const order: string[] = [];
 * app.defer(() => {
 * 	order.push("close logs");
 * });
 * const db = app.child({ value: { port: 5432 } });
 * db.defer((cause) => {
 * 	order.push(`close db: ${cause}`);
 * });
 *
 * assertEquals(db.with((conn) => conn.port), Some(5432));
 * app.end("cancelled");
 * assertEquals(db.with((conn) => conn.port), None());
 * assertEquals(order, ["close db: cancelled", "close logs"]);
 * ```
 */
export class Lifetime<T, C> {
	/**
	 * Dispatches the cause when the lifetime starts ending, before its
	 * teardown runs. Use `ending.toAbortSignal()` to hand it to `fetch`.
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const request = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * const forFetch = request.ending.toAbortSignal();
	 *
	 * request.end("navigated away");
	 * assertEquals(forFetch.reason, "navigated away");
	 * ```
	 */
	readonly ending: DispatchSignal<C>;
	/**
	 * Dispatches the report once the teardown has finished: `Ok(cause)`, or
	 * `Err` with the cause and every cleanup's panic.
	 *
	 * @example
	 * ```ts
	 * import { isOk } from "@sekhmet/enum/result/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * lifetime.defer(() => Promise.resolve());
	 *
	 * lifetime.end("done");
	 * assert(isOk(await lifetime.ended.wait()));
	 * ```
	 */
	readonly ended: DispatchSignal<EndReport<C>>;

	readonly #panics: PanicBoundary;
	readonly #ownDisposeCause: Option<C>;
	#value: Option<T>;
	readonly #stack: Entry<C>[] = [];
	#owner: OwnerLink<C> | undefined;
	readonly #endingController: DispatchController<C>;
	readonly #endedController: DispatchController<EndReport<C>>;

	/**
	 * A root lifetime holding `value`, until a parent adopts it.
	 *
	 * @param options The value; the panic runtime its cleanups and listeners
	 *   run in; and the cause `using` ends it with, optional (an adopted
	 *   child without one maps its owner's through `fromParent`)
	 */
	constructor({
		value,
		panics,
		disposeCause,
	}: {
		readonly value: T;
		readonly panics: PanicBoundary;
		readonly disposeCause?: C;
	}) {
		this.#value = Some(value);
		this.#panics = panics;
		if (disposeCause === undefined) {
			this.#ownDisposeCause = None();
		} else {
			this.#ownDisposeCause = Some(disposeCause);
		}
		this.#endingController = new DispatchController<C>({ panics });
		this.#endedController = new DispatchController<EndReport<C>>({ panics });
		this.ending = this.#endingController.signal;
		this.ended = this.#endedController.signal;
	}

	/**
	 * The phase, read from `ending` and `ended`.
	 *
	 * @returns `Alive(value)`, `Ending(cause)` or `Ended(report)`
	 *
	 * @example
	 * ```ts
	 * import { isolate } from "@sekhmet/enum/core/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<number, string>({
	 * 	value: 1,
	 * 	panics: definePanicRuntime(),
	 * });
	 * assert(isolate(lifetime.phase(), "Alive"));
	 *
	 * lifetime.end("done");
	 * assert(isolate(lifetime.phase(), "Ended"));
	 * ```
	 */
	phase(): Phase<T, C> {
		const ended = this.ended.poll();
		if (isolate(ended, "Ready")) {
			return new Phase<T, C>("Ended", union(ended));
		}
		const ending = this.ending.poll();
		if (isolate(ending, "Ready")) {
			return new Phase<T, C>("Ending", union(ending));
		}
		const value = this.#value;
		invariant(isolate(value, "Some"), {
			expectedBehavior:
				"a lifetime should hold its value until it starts ending",
		});
		return new Phase<T, C>("Alive", union(value));
	}

	/**
	 * The value, only while Alive. Prefer {@linkcode Lifetime.with}, which
	 * keeps the value inside a callback.
	 *
	 * @returns `Some(value)` while Alive, `None` once ending has started
	 *
	 * @example
	 * ```ts
	 * import { None, Some } from "@sekhmet/enum/option/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<string, string>({
	 * 	value: "conn",
	 * 	panics: definePanicRuntime(),
	 * });
	 * assertEquals(lifetime.value(), Some("conn"));
	 *
	 * lifetime.end("done");
	 * assertEquals(lifetime.value(), None());
	 * ```
	 */
	value(): Option<T> {
		return match(this.phase())({
			Alive: (value) => Some(value),
			Ending: () => None(),
			Ended: () => None(),
		});
	}

	/**
	 * Runs `fn` with the value while Alive: the preferred access, since the
	 * value stays inside the callback.
	 *
	 * @template R The type `fn` returns
	 * @param fn Reads or uses the value
	 * @returns `Some` of what `fn` returned while Alive, `None` once ending
	 *   has started (and `fn` didn't run)
	 *
	 * @example
	 * ```ts
	 * import { None, Some } from "@sekhmet/enum/option/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<{ readonly port: number }, string>({
	 * 	value: { port: 5432 },
	 * 	panics: definePanicRuntime(),
	 * });
	 * assertEquals(lifetime.with((conn) => conn.port), Some(5432));
	 *
	 * lifetime.end("done");
	 * assertEquals(lifetime.with((conn) => conn.port), None());
	 * ```
	 */
	with<R>(fn: (value: T) => R): Option<R> {
		return match(this.value())({
			Some: (value) => Some(fn(value)),
			None: () => None(),
		});
	}

	/**
	 * Registers a cleanup to run, with the cause, when the lifetime ends. It
	 * takes its place on the teardown stack, so it runs before whatever was
	 * acquired earlier.
	 *
	 * A registration made while the lifetime is ending joins the teardown
	 * that is running. One made after the end runs at once, with the cause
	 * it ended with; a throw from it comes back in `AfterEnd`'s vow.
	 *
	 * @param cleanup Runs once, with the cause; sync or async
	 * @returns `Registered(unregister)` while Alive, `DuringEnd` while
	 *   ending, or `AfterEnd(ran)` once ended
	 * @throws The `Panic (PanicHook)` of a double fault, when the lifetime
	 *   has ended and the cleanup it runs at once throws while the panic hook
	 *   throws too
	 *
	 * @example
	 * ```ts
	 * import { isolate } from "@sekhmet/enum/core/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * const ran: string[] = [];
	 * const registration = lifetime.defer((cause) => {
	 * 	ran.push(`closed: ${cause}`);
	 * });
	 *
	 * assert(isolate(registration, "Registered"));
	 * lifetime.end("done");
	 * assertEquals(ran, ["closed: done"]);
	 * ```
	 */
	defer(cleanup: Cleanup<C>): Registration {
		const panics = this.#panics;
		const entry: Entry<C> = {
			run: ({ cause, onDoubleFault }) => {
				try {
					return map(
						runCleanup({ cleanup: () => cleanup(cause), panics }),
						panicsOfCleanup,
					);
				} catch (thrown: unknown) {
					onDoubleFault(thrown);
					return resolved([
						asPanic({ payload: thrown, name: "CleanupFailed" }),
					]);
				}
			},
		};
		return match(this.phase())({
			Alive: () => new Registration("Registered", this.#push(entry)),
			Ending: () => {
				this.#stack.push(entry);
				return new Registration("DuringEnd");
			},
			Ended: (report) => {
				return new Registration(
					"AfterEnd",
					runCleanup({ cleanup: () => cleanup(causeOf(report)), panics }),
				);
			},
		});
	}

	#push(entry: Entry<C>): Unsubscribe {
		this.#stack.push(entry);
		return () => {
			const index = this.#stack.indexOf(entry);
			if (index < 0 || !isolate(this.ending.poll(), "Pending")) {
				return false;
			}
			this.#stack.splice(index, 1);
			return true;
		};
	}

	/**
	 * Adopts a root lifetime with its own cause type: `fromParent` maps this
	 * lifetime's cause into the child's, when this one's teardown reaches the
	 * child and not before. It also maps this lifetime's dispose cause, for
	 * a child that has none of its own.
	 *
	 * A `fromParent` that panics is a panic in this lifetime's report. The
	 * child then has no cause to end with, so it is released instead: it
	 * stays Alive as a root again, which another lifetime can adopt and
	 * whoever holds it can end.
	 *
	 * @template U The type of the child's value
	 * @template D The type of the child's cause
	 * @param options The child, and how to map this lifetime's cause into its
	 *   own
	 * @returns `Adopted`, or why not: `AlreadyOwned`, `WouldCycle`,
	 *   `ChildEnded`, or `ParentEnded` (the child was ended at once)
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const panics = definePanicRuntime();
	 * const app = new Lifetime<undefined, "shutdown">({ value: undefined, panics });
	 * const request = new Lifetime<string, { readonly aborted: string }>({
	 * 	value: "/",
	 * 	panics,
	 * });
	 *
	 * app.adopt({ child: request, fromParent: (cause) => ({ aborted: cause }) });
	 * app.end("shutdown");
	 * assertEquals(request.ending.poll(), Ready({ aborted: "shutdown" }));
	 * ```
	 */
	adopt<U, D>(options: {
		readonly child: Lifetime<U, D>;
		readonly fromParent: (cause: C) => D;
	}): Adoption;
	/**
	 * Adopts a root lifetime with the same cause type: it joins this
	 * lifetime's teardown stack, and ends with this lifetime's cause when the
	 * teardown reaches it. A child that ends on its own first leaves its
	 * owner and keeps its own cause, but its place on the stack holds a
	 * waiter until its teardown finishes, so this lifetime's end still
	 * awaits it there (its report belongs to whoever ended it).
	 *
	 * Adopting into a lifetime that is ending ends the child at once, and
	 * the teardown that is running awaits it, its panics joining the
	 * report. A `fromParent` that panics on any of these paths is reported
	 * (and kept in the report, while there is one), and leaves the child an
	 * Alive root.
	 *
	 * @template U The type of the child's value
	 * @param options The child to adopt
	 * @returns `Adopted`, or why not: `AlreadyOwned`, `WouldCycle`,
	 *   `ChildEnded`, or `ParentEnded` (the child was ended at once)
	 *
	 * @example
	 * ```ts
	 * import { isolate } from "@sekhmet/enum/core/mini";
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const panics = definePanicRuntime();
	 * const server = new Lifetime<string, string>({ value: "server", panics });
	 * const socket = new Lifetime<string, string>({ value: "socket", panics });
	 *
	 * assert(isolate(server.adopt({ child: socket }), "Adopted"));
	 * server.end("shutdown");
	 * assertEquals(socket.ending.poll(), Ready("shutdown"));
	 * ```
	 */
	adopt<U>(options: { readonly child: Lifetime<U, C> }): Adoption;
	adopt<U, D>(
		options:
			| { readonly child: Lifetime<U, C> }
			| {
					readonly child: Lifetime<U, D>;
					readonly fromParent: (cause: C) => D;
			  },
		// {}
	): Adoption {
		if ("fromParent" in options) {
			return this.#adopt<U, D>({
				child: options.child,
				fromParent: options.fromParent,
			});
		}
		return this.#adopt<U, C>({
			child: options.child,
			fromParent: (cause) => cause,
		});
	}

	#adopt<U, D>({
		child,
		fromParent,
	}: {
		readonly child: Lifetime<U, D>;
		readonly fromParent: (cause: C) => D;
	}): Adoption {
		if (child.#owner !== undefined) {
			return new Adoption("AlreadyOwned");
		}
		if (this.#ownedBy(child)) {
			return new Adoption("WouldCycle");
		}
		if (!isolate(child.phase(), "Alive")) {
			return new Adoption("ChildEnded");
		}
		const panics = this.#panics;
		return match(this.phase())({
			Alive: () => {
				let remove: Unsubscribe = () => false;
				// A fromParent panic leaves the child a root: no owner, no entry.
				const release = (): void => {
					child.#owner = undefined;
					remove();
				};
				remove = this.#push(childEntry({ child, fromParent, panics, release }));
				child.#owner = {
					owner: this,
					up: () => this.#owner,
					leave: () => {
						child.ended.whenDispatched(() => {
							remove();
						});
					},
					disposeCause: () => {
						const own = this.#disposeCause();
						if (isErr(own)) {
							return Err(unwrapErr(own));
						}
						const option = unwrap(own);
						if (!isolate(option, "Some")) {
							return Ok(None());
						}
						const mapped = mapCause({
							fromParent,
							cause: union(option),
							panics,
						});
						if (isErr(mapped)) {
							release();
							return Err(unwrapErr(mapped));
						}
						return Ok(Some(unwrap(mapped)));
					},
				};
				return new Adoption("Adopted");
			},
			Ending: (cause) => {
				// Born dead: ended at once, and the teardown running waits for it.
				let doubleFault: { readonly thrown: unknown } | undefined;
				const ran = endChild({
					child,
					fromParent,
					cause,
					panics,
					release: () => {},
					onDoubleFault: (thrown) => {
						doubleFault ??= { thrown };
					},
				});
				this.#stack.push({ run: () => ran });
				if (doubleFault !== undefined) {
					throw doubleFault.thrown;
				}
				return new Adoption("ParentEnded");
			},
			Ended: (report) => {
				let doubleFault: { readonly thrown: unknown } | undefined;
				endChild({
					child,
					fromParent,
					cause: causeOf(report),
					panics,
					release: () => {},
					onDoubleFault: (thrown) => {
						doubleFault ??= { thrown };
					},
				});
				if (doubleFault !== undefined) {
					throw doubleFault.thrown;
				}
				return new Adoption("ParentEnded");
			},
		});
	}

	/** Whether `candidate` is this lifetime or one of its owners. */
	#ownedBy(candidate: object): boolean {
		if (candidate === this) {
			return true;
		}
		for (
			let link: OwnerLink<unknown> | undefined = this.#owner;
			link !== undefined;
			link = link.up()
		) {
			if (link.owner === candidate) {
				return true;
			}
		}
		return false;
	}

	/** Its own dispose cause, or its owner's mapped into it. */
	#disposeCause(): Result<Option<C>, Panic<unknown>> {
		if (isolate(this.#ownDisposeCause, "Some")) {
			return Ok(this.#ownDisposeCause);
		}
		const link = this.#owner;
		if (link === undefined) {
			return Ok(None());
		}
		return link.disposeCause();
	}

	/**
	 * A new child holding `value`, with its own cause type: `fromParent`
	 * produces it when this lifetime's teardown reaches the child. If it
	 * panics, the child is released as a root, as with `adopt`.
	 *
	 * @template U The type of the child's value
	 * @template D The type of the child's cause
	 * @param options The child's value, and how to map this lifetime's cause
	 *   into the child's
	 * @returns The child, already adopted (or ended at once, if this
	 *   lifetime is ending)
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const app = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * const request = app.child({
	 * 	value: "/",
	 * 	fromParent: (cause: string): number => cause.length,
	 * });
	 *
	 * app.end("shutdown");
	 * assertEquals(request.ending.poll(), Ready(8));
	 * ```
	 */
	child<U, D>(options: {
		readonly value: U;
		readonly fromParent: (cause: C) => D;
	}): Lifetime<U, D>;
	/**
	 * A new child holding `value`, sharing this lifetime's cause type and
	 * panic runtime: `new Lifetime` plus `adopt`.
	 *
	 * @template U The type of the child's value
	 * @param options The child's value
	 * @returns The child, already adopted (or ended at once, if this
	 *   lifetime is ending)
	 *
	 * @example
	 * ```ts
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const app = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * const worker = app.child({ value: "worker 1" });
	 *
	 * app.end("shutdown");
	 * assertEquals(worker.ending.poll(), Ready("shutdown"));
	 * ```
	 */
	child<U>(options: { readonly value: U }): Lifetime<U, C>;
	child<U, D>(
		options:
			| { readonly value: U }
			| { readonly value: U; readonly fromParent: (cause: C) => D },
		// {}
	): Lifetime<U, C> | Lifetime<U, D> {
		if ("fromParent" in options) {
			const mapped = new Lifetime<U, D>({
				value: options.value,
				panics: this.#panics,
			});
			this.adopt({ child: mapped, fromParent: options.fromParent });
			return mapped;
		}
		const same = new Lifetime<U, C>({
			value: options.value,
			panics: this.#panics,
		});
		this.adopt({ child: same });
		return same;
	}

	/**
	 * Ends this lifetime when `signal` dispatches, with its value as the
	 * cause: link it to a timeout, a user's cancel, or
	 * `DispatchSignal.any([...])` of several. The link is released when this
	 * lifetime ends.
	 *
	 * @param signal The outside signal whose value ends this lifetime
	 * @returns A function that unlinks the signal; `true` if it was still
	 *   linked
	 *
	 * @example
	 * ```ts
	 * import { DispatchController } from "@sekhmet/dispatch";
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const panics = definePanicRuntime();
	 * const lifetime = new Lifetime<undefined, string>({ value: undefined, panics });
	 * const cancel = new DispatchController<string>({ panics });
	 * lifetime.endWhen(cancel.signal);
	 *
	 * cancel.dispatch("user cancelled");
	 * assertEquals(lifetime.ending.poll(), Ready("user cancelled"));
	 * ```
	 */
	endWhen(signal: DispatchSignal<C>): Unsubscribe {
		const stop = signal.whenDispatched((cause) => {
			this.end(cause);
		});
		const registration = this.defer(() => {
			stop();
		});
		return () => {
			const stopped = stop();
			match(registration)({
				Registered: (unregister) => void unregister(),
				DuringEnd: () => undefined,
				AfterEnd: () => undefined,
			});
			return stopped;
		};
	}

	/**
	 * Ends the lifetime and returns `ended`. It is idempotent: the first
	 * cause wins, and a later call just returns `ended`.
	 *
	 * It drops the value, leaves its owner, dispatches `ending`, runs the
	 * teardown stack last-in first-out (entries added meanwhile join it,
	 * and an async cleanup is awaited before the next entry runs), then
	 * dispatches `ended` with the report. When every cleanup is synchronous,
	 * `ended` has dispatched by the time `end` returns.
	 *
	 * A cleanup's throw or rejection never reaches the caller: it becomes a
	 * `Panic` in the report. The one exception is a double fault, the panic
	 * hook throwing while it reports a throw, so that the boundary throws a
	 * `Panic (PanicHook)`:
	 *
	 * - During the synchronous part of `end`, the teardown still drains as
	 *   far as it can synchronously, then `end` rethrows the first double
	 *   fault. Its panic is in the report too (one from an `ended` listener
	 *   excepted, since the report is already out).
	 * - In an async continuation (after an async cleanup), nothing is
	 *   thrown, since a throw there would be an unhandled rejection: the
	 *   double fault is in the report as a panic. One from an `ended`
	 *   listener there is lost.
	 *
	 * @param cause Why the lifetime ends; given to every cleanup and child
	 * @returns The `ended` signal, which dispatches the report
	 * @throws The first `Panic (PanicHook)` of a double fault during the
	 *   synchronous part of the teardown
	 *
	 * @example
	 * ```ts
	 * import { Ok } from "@sekhmet/enum/result/mini";
	 * import { Ready } from "@sekhmet/enum/poll/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * const lifetime = new Lifetime<undefined, string>({
	 * 	value: undefined,
	 * 	panics: definePanicRuntime(),
	 * });
	 * const first = lifetime.end("cancelled");
	 * const second = lifetime.end("done");
	 *
	 * assert(first === second && first === lifetime.ended);
	 * assertEquals(first.poll(), Ready(Ok("cancelled")));
	 * ```
	 */
	end(cause: C): DispatchSignal<EndReport<C>> {
		if (!isolate(this.phase(), "Alive")) {
			return this.ended;
		}
		this.#value = None();
		this.#owner?.leave();
		this.#owner = undefined;

		const failures: Panic<unknown>[] = [];
		let synchronous = true;
		let doubleFault: { readonly thrown: unknown } | undefined;
		const onDoubleFault = (thrown: unknown): void => {
			if (synchronous) {
				doubleFault ??= { thrown };
			}
		};

		try {
			this.#endingController.dispatch(cause);
		} catch (thrown: unknown) {
			failures.push(asPanic({ payload: thrown, name: "ListenerFailed" }));
			onDoubleFault(thrown);
		}
		const finish = (): void => {
			const report = block((): EndReport<C> => {
				if (failures.length === 0) {
					return Ok(cause);
				}
				return Err({ cause, panics: failures });
			});
			try {
				this.#endedController.dispatch(report);
			} catch (thrown: unknown) {
				onDoubleFault(thrown);
			}
		};
		const drain = (): void => {
			let next = this.#stack.pop();
			while (next !== undefined) {
				const ran = next.run({ cause, onDoubleFault });
				const settled = vowValue(ran);
				if (!isolate(settled, "Some")) {
					map(ran, (panics) => {
						failures.push(...panics);
						drain();
					});
					return;
				}
				failures.push(...union(settled));
				next = this.#stack.pop();
			}
			finish();
		};
		drain();
		synchronous = false;

		if (doubleFault !== undefined) {
			throw doubleFault.thrown;
		}
		return this.ended;
	}

	/**
	 * For `using`: ends the lifetime with its dispose cause, and throws its
	 * cleanups' panics, chained as `SuppressedError`s when there are several.
	 * The dispose cause is the lifetime's own, or its owner's mapped through
	 * `fromParent`.
	 *
	 * It throws only the failures of a teardown it started itself: if `end`
	 * was already called, it does nothing, and whoever called `end` reads
	 * the report. It is installed only where the runtime defines
	 * `Symbol.dispose`; `end(cause)` is the explicit path everywhere.
	 *
	 * @throws `Panic (NoDisposeCause)` when it has no dispose cause; the
	 *   panic of a `fromParent` that panicked while mapping one (the child
	 *   is then released as a root); `Panic (AsyncCleanupUnderUsing)` when a
	 *   cleanup is async (its teardown still runs to the end), which needs
	 *   `await using`; and the cleanups' panics, when any failed
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert } from "@std/assert";
	 *
	 * let released = false;
	 * {
	 * 	using lifetime = new Lifetime<undefined, string>({
	 * 		value: undefined,
	 * 		panics: definePanicRuntime(),
	 * 		disposeCause: "scope exited",
	 * 	});
	 * 	lifetime.defer(() => {
	 * 		released = true;
	 * 	});
	 * }
	 * assert(released);
	 * ```
	 */
	declare readonly [Symbol.dispose]: () => void;

	/**
	 * For `await using`: ends the lifetime with its dispose cause, awaits its
	 * teardown, and rejects with its cleanups' panics, chained as
	 * `SuppressedError`s when there are several.
	 *
	 * If `end` was already called, it only awaits the teardown, and never
	 * rejects with its failures: whoever called `end` reads the report. It
	 * is installed only where the runtime defines `Symbol.asyncDispose`.
	 *
	 * @returns A promise that settles once the teardown has finished
	 * @throws `Panic (NoDisposeCause)` when it has no dispose cause; the
	 *   panic of a `fromParent` that panicked while mapping one; and the
	 *   cleanups' panics, when any failed
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Lifetime } from "@sekhmet/lifetime";
	 * import { assert } from "@std/assert";
	 *
	 * let closed = false;
	 * {
	 * 	await using db = new Lifetime<undefined, string>({
	 * 		value: undefined,
	 * 		panics: definePanicRuntime(),
	 * 		disposeCause: "scope exited",
	 * 	});
	 * 	db.defer(async () => {
	 * 		await Promise.resolve();
	 * 		closed = true;
	 * 	});
	 * }
	 * assert(closed);
	 * ```
	 */
	declare readonly [Symbol.asyncDispose]: () => Promise<void>;

	static {
		installDisposers({
			target: Lifetime.prototype,
			symbols: Symbol,
			dispose: function (this: Lifetime<unknown, unknown>): void {
				this.#dispose();
			},
			asyncDispose: function (this: Lifetime<unknown, unknown>): Promise<void> {
				return this.#asyncDispose();
			},
		});
	}

	#dispose(): void {
		if (!isolate(this.phase(), "Alive")) {
			return;
		}
		const polled = this.end(this.#requireDisposeCause()).poll();
		if (!isolate(polled, "Ready")) {
			panic({
				name: "AsyncCleanupUnderUsing",
				message:
					"a cleanup is async, so this lifetime needs `await using`, not `using`",
				cause: undefined,
			});
		}
		throwIfFailed(union(polled));
	}

	async #asyncDispose(): Promise<void> {
		if (!isolate(this.phase(), "Alive")) {
			await this.ended.wait();
			return;
		}
		throwIfFailed(await this.end(this.#requireDisposeCause()).wait());
	}

	#requireDisposeCause(): C {
		const disposeCause = this.#disposeCause();
		if (isErr(disposeCause)) {
			throw unwrapErr(disposeCause);
		}
		const option = unwrap(disposeCause);
		if (!isolate(option, "Some")) {
			return panic({
				name: "NoDisposeCause",
				message:
					"this lifetime has no disposeCause, so `using` can't end it: pass one, or adopt it into a parent that has one",
				cause: undefined,
			});
		}
		return union(option);
	}
}

/**
 * The teardown entry of an adopted child. A child still Alive is ended with
 * the parent's cause, mapped into its own, and its report's panics are
 * collected. A child that ended on its own is only waited for: its report
 * belongs to whoever ended it. It never throws.
 */
function childEntry<C, U, D>({
	child,
	fromParent,
	panics,
	release,
}: {
	readonly child: Lifetime<U, D>;
	readonly fromParent: (cause: C) => D;
	readonly panics: PanicBoundary;
	/** Unlinks the child from its owner, making it a root */
	readonly release: () => void;
}): Entry<C> {
	return {
		run: ({ cause, onDoubleFault }) => {
			if (!isolate(child.phase(), "Alive")) {
				return map(child.ended.toVow(), () => []);
			}
			return endChild({
				child,
				fromParent,
				cause,
				panics,
				release,
				onDoubleFault,
			});
		},
	};
}

/**
 * Ends `child` with `fromParent(cause)`, and collects the panics of its
 * report. If the mapping panics, there is no cause to end the child with,
 * so it is released as a root, and the mapping's panic is the result. A
 * synchronous double fault goes to `onDoubleFault`; it never throws.
 */
function endChild<C, U, D>({
	child,
	fromParent,
	cause,
	panics,
	release,
	onDoubleFault,
}: {
	readonly child: Lifetime<U, D>;
	readonly fromParent: (cause: C) => D;
	readonly cause: C;
	readonly panics: PanicBoundary;
	readonly release: () => void;
	readonly onDoubleFault: (thrown: unknown) => void;
}): Vow<readonly Panic<unknown>[]> {
	let mapped: Result<D, Panic<unknown>>;
	try {
		mapped = mapCause({ fromParent, cause, panics });
	} catch (thrown: unknown) {
		release();
		onDoubleFault(thrown);
		return resolved([causeMappingFailed(thrown)]);
	}
	if (isErr(mapped)) {
		release();
		return resolved([unwrapErr(mapped)]);
	}
	try {
		child.end(unwrap(mapped));
	} catch (thrown: unknown) {
		// The child's report holds its panic; only the rethrow is ours.
		onDoubleFault(thrown);
	}
	return map(child.ended.toVow(), panicsOfReport);
}

/**
 * Runs `fromParent` inside the panic boundary: a throw is reported to the
 * hook and comes back as a `Panic (CauseMappingFailed)`. It throws only on
 * a synchronous double fault.
 */
function mapCause<C, D>({
	fromParent,
	cause,
	panics,
}: {
	readonly fromParent: (cause: C) => D;
	readonly cause: C;
	readonly panics: PanicBoundary;
}): Result<D, Panic<unknown>> {
	// Boxed, so a thenable D stays a value instead of being adopted
	const boundary = panics.catchUnwind(() => ({ mapped: fromParent(cause) }));
	const caught = expectReady(poll(boundary), "the box settles at once");
	if (isPanicked(caught)) {
		return Err(causeMappingFailed(unwrapPanicked(caught)));
	}
	return Ok(unwrapOutcome(caught).mapped);
}

function causeMappingFailed(payload: unknown): Panic<unknown> {
	return asPanic({ payload, name: "CauseMappingFailed" });
}

function panicsOfCleanup(
	outcome: Result<void, Panic<unknown>>,
): readonly Panic<unknown>[] {
	return isErr(outcome) ? [unwrapErr(outcome)] : [];
}

function panicsOfReport<D>(report: EndReport<D>): readonly Panic<unknown>[] {
	return isErr(report) ? unwrapErr(report).panics : [];
}
