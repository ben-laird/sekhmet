/**
 * The rising edge: {@linkcode Resource}, one adapter over any kind of setup
 * and teardown, and {@linkcode SetupEnd}, why what its `init` acquired was
 * released.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini";
import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import type { Panic } from "@sekhmet/panic";
import { map, resolved, type Vow, vowWithResolver } from "@sekhmet/vow/mini";
import { Lifetime, type LifetimePanics } from "./lifetime.ts";
import { asPanic, deliver, isThenable } from "./teardown.ts";

/**
 * The variants of {@linkcode SetupEnd}.
 *
 * @template C The type of the resource's cause
 */
type Variants<C> = Split<{
	/** The resource's lifetime ended normally, with this cause. */
	Ended: [cause: C];
	/** `init` panicked before the resource existed; this is the panic. */
	InitPanicked: [panic: Panic<unknown>];
}>;

export type { Variants as SetupEndVariants };

/**
 * Why a resource's setup was torn down: the cause of the `setup` lifetime
 * its `init` receives. `Ended(cause)` when the resource's lifetime ended
 * normally (after `deinit`), or `InitPanicked(panic)` when `init` panicked
 * and setup was torn down at once, so nothing it acquired leaks. Read it
 * with `match`.
 *
 * @template C The type of the resource's cause
 *
 * @example
 * ```ts
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Panic } from "@sekhmet/panic";
 * import { SetupEnd } from "@sekhmet/lifetime";
 * import { assertEquals } from "@std/assert";
 *
 * const show = (end: SetupEnd<string>): string => {
 * 	return match(end)({
 * 		Ended: (cause) => `ended: ${cause}`,
 * 		InitPanicked: (panic) => `init panicked: ${panic.message}`,
 * 	});
 * };
 * const failure = new Panic({ message: "handshake failed", cause: null });
 *
 * assertEquals(show(new SetupEnd<string>("Ended", "done")), "ended: done");
 * assertEquals(
 * 	show(new SetupEnd<string>("InitPanicked", failure)),
 * 	"init panicked: handshake failed",
 * );
 * ```
 */
export class SetupEnd<out C> extends Enum<Variants<C>> {}

/**
 * The rising edge of RAII, one adapter over any kind of setup and teardown:
 * `init` acquires a `T` from an input, and `deinit` releases it. Each
 * `start` acquires one `T` and hands back a {@linkcode Lifetime} that
 * guarantees its teardown.
 *
 * `init` also receives `setup`, a lifetime of its own: whatever it defers
 * or adopts there is released after `deinit`, so a resource built on
 * others (a repository on a connection) tears down in the right order. If
 * `init` panics, `setup` is torn down at once.
 *
 * @template I The type of the input `init` acquires from
 * @template T The type of the acquired value
 * @template C The type of the cause its lifetimes end with
 *
 * @example
 * ```ts
 * import { isolate, union } from "@sekhmet/enum/core/mini";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { value } from "@sekhmet/vow/mini";
 * import { Resource } from "@sekhmet/lifetime";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const log: string[] = [];
 * const database = new Resource<string, { readonly url: string }, string>({
 * 	init: (url) => {
 * 		log.push(`open ${url}`);
 * 		return { url };
 * 	},
 * 	deinit: (client, cause) => {
 * 		log.push(`close ${client.url}: ${cause}`);
 * 	},
 * });
 *
 * const started = value(
 * 	database.start({ input: "postgres://a", panics: definePanicRuntime() }),
 * );
 * assert(isolate(started, "Some")); // a sync init settles at once
 * const db = unwrap(union(started));
 * db.end("done");
 *
 * assertEquals(log, ["open postgres://a", "close postgres://a: done"]);
 * ```
 */
export class Resource<I, T, C> {
	readonly #init: (
		input: I,
		setup: Lifetime<undefined, SetupEnd<C>>,
	) => T | PromiseLike<T>;
	readonly #deinit: (value: T, cause: C) => void | PromiseLike<void>;

	/**
	 * A resource from its two edges.
	 *
	 * @param options `init`, the rising edge: it acquires a `T` from the
	 *   input, synchronously or not, and what it defers or adopts on `setup`
	 *   is released after `deinit` (with `Ended(cause)`), or at once if it
	 *   panics (with `InitPanicked(panic)`). `deinit`, the falling edge: it
	 *   releases the value, given the cause its lifetime ended with.
	 */
	constructor({
		init,
		deinit,
	}: {
		readonly init: (
			input: I,
			setup: Lifetime<undefined, SetupEnd<C>>,
		) => T | PromiseLike<T>;
		readonly deinit: (value: T, cause: C) => void | PromiseLike<void>;
	}) {
		this.#init = init;
		this.#deinit = deinit;
	}

	/**
	 * Acquires a `T` for `input`. It settles synchronously when `init` is
	 * sync, so anything that may be sync or async comes back as a `Vow`.
	 *
	 * A panic in `init` (a throw, or a rejection) is reported to the panic
	 * hook and returned as `Err`, after `setup` has been torn down with
	 * `InitPanicked(panic)`. An expected failure is `init` returning a
	 * `Result` of its own.
	 *
	 * A double fault in `init` (the hook throwing while it reports `init`'s
	 * throw) follows `Lifetime.end`'s rule: in a synchronous `init`, setup
	 * is torn down and `start` rethrows the `Panic (PanicHook)`; in an async
	 * one, it is the `Err`'s panic.
	 *
	 * @param options The input; the panic runtime; and the lifetime's
	 *   dispose cause, for `using`, optional
	 * @returns A vow of the started lifetime, or of `init`'s panic
	 * @throws The `Panic (PanicHook)` of a double fault in a synchronous
	 *   `init`
	 *
	 * @example
	 * ```ts
	 * import { unwrap } from "@sekhmet/enum/result/mini";
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { wait } from "@sekhmet/vow/mini";
	 * import { Resource } from "@sekhmet/lifetime";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const log: string[] = [];
	 * const pool = new Resource<number, { readonly size: number }, string>({
	 * 	init: async (size) => {
	 * 		await Promise.resolve();
	 * 		return { size };
	 * 	},
	 * 	deinit: async (_pool, cause) => {
	 * 		await Promise.resolve();
	 * 		log.push(`drained: ${cause}`);
	 * 	},
	 * });
	 *
	 * {
	 * 	await using connections = unwrap(
	 * 		await wait(
	 * 			pool.start({
	 * 				input: 4,
	 * 				panics: definePanicRuntime(),
	 * 				disposeCause: "shutdown",
	 * 			}),
	 * 		),
	 * 	);
	 * 	connections.with((p) => void log.push(`size ${p.size}`));
	 * }
	 * assertEquals(log, ["size 4", "drained: shutdown"]);
	 * ```
	 */
	start({
		input,
		panics,
		disposeCause,
	}: {
		readonly input: I;
		readonly panics: LifetimePanics;
		readonly disposeCause?: C;
	}): Vow<Result<Lifetime<T, C>, Panic<unknown>>> {
		const setup = new Lifetime<undefined, SetupEnd<C>>({
			value: undefined,
			panics,
		});
		const succeed = (value: T): Result<Lifetime<T, C>, Panic<unknown>> => {
			const lifetime = new Lifetime<T, C>({
				value,
				panics,
				...(disposeCause === undefined ? {} : { disposeCause }),
			});
			// Adopted first, so it sits beneath deinit and outlives it.
			lifetime.adopt({
				child: setup,
				fromParent: (cause) => new SetupEnd<C>("Ended", cause),
			});
			lifetime.defer((cause) => this.#deinit(value, cause));
			return Ok(lifetime);
		};
		// Tears setup down; throws only on a synchronous double fault in it.
		const fail = (
			failure: Panic<unknown>,
		): Vow<Result<Lifetime<T, C>, Panic<unknown>>> => {
			const torn = setup.end(new SetupEnd<C>("InitPanicked", failure));
			return map(torn.toVow(), () => Err(failure));
		};

		let caught: Result<{ readonly returned: T | PromiseLike<T> }, unknown>;
		try {
			// Boxed, so catchUnwind's promise guard sees an object, not a maybe-promise.
			caught = panics.catchUnwind(() => ({
				returned: this.#init(input, setup),
			}));
		} catch (doubleFault: unknown) {
			try {
				fail(initFailed(doubleFault));
			} catch {
				// A second double fault, in setup's teardown: the first one wins.
			}
			throw doubleFault;
		}
		if (isErr(caught)) {
			return fail(initFailed(unwrapErr(caught)));
		}
		const { returned } = unwrap(caught);
		if (!isThenable(returned)) {
			return resolved(succeed(returned));
		}

		const { vow, resolve } =
			vowWithResolver<Result<Lifetime<T, C>, Panic<unknown>>>();
		const settle = (
			outcome: Vow<Result<Lifetime<T, C>, Panic<unknown>>>,
		): void => {
			map(outcome, (result) => {
				deliver({ resolve, value: result, panics });
			});
		};
		// In a promise continuation, a double fault from setup's teardown can't
		// be thrown; it is in setup's report, and init's panic is the Err.
		const failInContinuation = (payload: unknown): void => {
			const failure = initFailed(payload);
			try {
				settle(fail(failure));
			} catch {
				settle(resolved(Err(failure)));
			}
		};
		const settling = panics.catchUnwindAsync(() => returned);
		void settling.then(
			(settled) => {
				if (isErr(settled)) {
					failInContinuation(unwrapErr(settled));
					return;
				}
				settle(resolved(succeed(unwrap(settled))));
			},
			(doubleFault: unknown) => {
				failInContinuation(doubleFault);
			},
		);
		return vow;
	}
}

function initFailed(payload: unknown): Panic<unknown> {
	return asPanic({ payload, name: "InitFailed" });
}
