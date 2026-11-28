/**
 * The rising edge: {@linkcode Resource}, one adapter over any kind of setup
 * and teardown, and {@linkcode SetupEnd}, why what its `init` acquired was
 * released.
 *
 * @module
 */

import { Enum, isolate, type Split, union } from "@sekhmet/enum/core/mini";
import { isReady } from "@sekhmet/enum/poll/mini";
import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
import { Panic, type PanicBoundary } from "@sekhmet/panic";
import {
	isPanicked,
	type Outcome,
	Ok as OutcomeOk,
	unwrap as unwrapOutcome,
	unwrapPanicked,
} from "@sekhmet/panic/outcome/mini";
import { andThen, poll, resolved, type Vow } from "@sekhmet/vow/mini";
import { Lifetime } from "./lifetime.ts";
import type { EndReport } from "./phase.ts";
import { asPanic } from "./teardown.ts";

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
 * `setup` belongs to the resource: `init` shouldn't adopt it into another
 * lifetime. If it does, `setup` still ends right after `deinit`, as its
 * last cleanup; its failures then go to the panic hook only, not into the
 * lifetime's report, since another owner holds it.
 *
 * @template I The type of the input `init` acquires from
 * @template T The type of the acquired value
 * @template C The type of the cause its lifetimes end with
 *
 * @example
 * ```ts
 * import { isolate, union } from "@sekhmet/enum/core/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { unwrap } from "@sekhmet/panic/outcome/mini";
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
	 * It settles an `Outcome`, as the panic boundary it runs `init` under
	 * does: `Ok(lifetime)`, or `Panicked(payload)` when `init` panicked (a
	 * throw, or a rejection). The panic was reported to the hook once, and
	 * `setup` was torn down with `InitPanicked(panic)` first. There is no
	 * `Err`: an expected failure is `init` returning a `Result` of its own.
	 * Unwrapping a `Panicked` throws the payload again, as Rust's
	 * `resume_unwind` does.
	 *
	 * The payload is `init`'s panic, a `Panic (InitFailed)` around what it
	 * threw unless that already was a `Panic`. That wrapper is what the hook
	 * reports, once, with the original payload as its cause, so unwrapping it
	 * into an outer boundary of the same runtime doesn't report it again. If tearing `setup` down fails
	 * too, the payload carries both: a `Panic (SetupTeardownFailed)` whose
	 * cause, a {@linkcode SetupTeardownFailure}, holds `init`'s panic and
	 * each of setup's cleanup panics. Read it with
	 * {@linkcode isSetupTeardownPanic}.
	 *
	 * A double fault in `init` (the hook throwing while it reports `init`'s
	 * throw) follows `Lifetime.end`'s rule: in a synchronous `init`, setup
	 * is torn down and `start` rethrows the `Panic (PanicHook)`. In an async
	 * one, `init`'s panic is still the payload, and the `Panic (PanicHook)`
	 * escapes as an unhandled rejection, as `catchUnwind`'s contract says.
	 *
	 * @param options The input; the panic runtime; and the lifetime's
	 *   dispose cause, for `using`, optional
	 * @returns A vow of `Ok` of the started lifetime, or `Panicked` of
	 *   `init`'s panic
	 * @throws The `Panic (PanicHook)` of a double fault in a synchronous
	 *   `init`
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { unwrap } from "@sekhmet/panic/outcome/mini";
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
		readonly panics: PanicBoundary;
		readonly disposeCause?: C;
	}): Vow<Outcome<Lifetime<T, C>, never, unknown>> {
		type Started = Outcome<Lifetime<T, C>, never, unknown>;
		const setup = new Lifetime<undefined, SetupEnd<C>>({
			value: undefined,
			panics,
		});
		const succeed = (value: T): Started => {
			const lifetime = new Lifetime<T, C>({
				value,
				panics,
				...(disposeCause === undefined ? {} : { disposeCause }),
			});
			// Adopted first, so it sits beneath deinit and outlives it.
			const adoption = lifetime.adopt({
				child: setup,
				fromParent: (cause) => new SetupEnd<C>("Ended", cause),
			});
			if (isolate(adoption, "AlreadyOwned")) {
				// init gave setup another owner: it still ends after deinit.
				lifetime.defer((cause) => endSetup({ setup, cause }));
			}
			lifetime.defer((cause) => this.#deinit(value, cause));
			return OutcomeOk(lifetime);
		};
		// Settles as Panicked once setup is torn down, with its failures too. The
		// carrier holds panics already reported, so it is resumed into the
		// boundary: recorded as reported without reaching the hook again.
		const afterSetup = (failure: Panic<unknown>): Vow<Started> => {
			return andThen(setup.ended.toVow(), (report) => {
				const payload = withSetupFailures({ init: failure, report });
				return panics.catchUnwind(() => panics.resumeUnwind(payload));
			});
		};
		// Tears setup down; throws only on a synchronous double fault in it.
		const fail = (failure: Panic<unknown>): Vow<Started> => {
			setup.end(new SetupEnd<C>("InitPanicked", failure));
			return afterSetup(failure);
		};

		let caught: Vow<Outcome<T, never, unknown>>;
		try {
			// init's panic is thrown as its wrapper, so the wrapper is what's reported
			caught = panics.catchUnwind(
				throwingInitFailed(() => this.#init(input, setup)),
			);
		} catch (doubleFault: unknown) {
			try {
				fail(initFailed(doubleFault));
			} catch {
				// A second double fault, in setup's teardown: the first one wins.
			}
			throw doubleFault;
		}
		const now = poll(caught);
		if (isReady(now)) {
			const settled = union(now);
			if (isPanicked(settled)) {
				return fail(initFailed(unwrapPanicked(settled)));
			}
			return resolved(succeed(unwrapOutcome(settled)));
		}

		// In a promise continuation, a double fault from setup's teardown can't
		// be thrown; it is in setup's report, which the payload carries.
		return andThen(caught, (settled) => {
			if (!isPanicked(settled)) {
				return resolved(succeed(unwrapOutcome(settled)));
			}
			const failure = initFailed(unwrapPanicked(settled));
			try {
				setup.end(new SetupEnd<C>("InitPanicked", failure));
			} catch {
				// Recorded in setup's report; see above.
			}
			return afterSetup(failure);
		});
	}
}

function initFailed(payload: unknown): Panic<unknown> {
	return asPanic({ payload, name: "InitFailed" });
}

/**
 * `init`, throwing or rejecting with its `Panic (InitFailed)` wrapper in
 * place of what it threw or rejected with. Run inside the boundary, the
 * wrapper is what gets reported, once, and what travels in `Panicked`: an
 * outer boundary it is unwrapped into doesn't report it again, and the
 * original payload, its cause, is never reported apart from it. A returned
 * thenable's `then` is read once and called with the wrapping callbacks.
 */
function throwingInitFailed<T>(
	init: () => T | PromiseLike<T>,
): () => T | PromiseLike<T> {
	return () => {
		try {
			const returned = init();
			const then: unknown =
				typeof returned === "object" && returned !== null
					? Reflect.get(returned, "then")
					: undefined;
			if (typeof then !== "function") return returned;
			return Reflect.apply(then, returned, [
				(value: T) => value,
				(reason: unknown) => {
					throw initFailed(reason);
				},
			]);
		} catch (payload: unknown) {
			throw initFailed(payload);
		}
	};
}

/**
 * The cause of the panic `start` settles as `Panicked` when `init` panicked
 * and tearing its `setup` down failed too: `init`'s panic, and each of setup's cleanup
 * panics, in the order they ran. Each was reported to the panic hook once,
 * when it happened; the panic that carries them is not reported again.
 *
 * @example
 * ```ts
 * import { isolate, union } from "@sekhmet/enum/core/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { isPanicked, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
 * import { value } from "@sekhmet/vow/mini";
 * import { isSetupTeardownPanic, Resource } from "@sekhmet/lifetime";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const panics = definePanicRuntime();
 * panics.setHook(() => {}); // keep the example quiet
 * const flaky = new Resource<undefined, never, string>({
 * 	init: (_input, setup) => {
 * 		setup.defer(() => {
 * 			throw new Error("temp dir already gone");
 * 		});
 * 		throw new Error("handshake failed");
 * 	},
 * 	deinit: () => {},
 * });
 *
 * const started = value(flaky.start({ input: undefined, panics }));
 * assert(isolate(started, "Some"));
 * const result = union(started);
 * assert(isPanicked(result));
 * const failure = unwrapPanicked(result);
 * assert(isSetupTeardownPanic(failure));
 * assertEquals(failure.cause.init.message, "handshake failed");
 * assertEquals(
 * 	failure.cause.teardown.map((panic) => panic.message),
 * 	["temp dir already gone"],
 * );
 * ```
 */
export interface SetupTeardownFailure {
	/** The panic `init` threw or rejected with */
	readonly init: Panic<unknown>;
	/** Each of setup's cleanup panics, in the order they ran */
	readonly teardown: readonly Panic<unknown>[];
}

/** The `Panic (SetupTeardownFailed)`; the private brand runs no Proxy trap. */
class SetupTeardownPanic extends Panic<SetupTeardownFailure> {
	constructor(cause: SetupTeardownFailure) {
		super({
			name: "SetupTeardownFailed",
			message: `init panicked (${cause.init.message}), and tearing its setup down failed too`,
			cause,
		});
	}

	#brand = true;

	static is(value: unknown): value is SetupTeardownPanic {
		return typeof value === "object" && value !== null && #brand in value;
	}
}

/**
 * Whether `value` is the panic `start` returns when `init` panicked and
 * tearing its `setup` down failed too. It narrows the panic, so its cause,
 * a {@linkcode SetupTeardownFailure}, can be read without a cast.
 *
 * @param value Any value, usually the panic in `start`'s `Err`
 * @returns True if `start` built `value` for an init and setup failure
 *
 * @example
 * ```ts
 * import { Panic } from "@sekhmet/panic";
 * import { isSetupTeardownPanic } from "@sekhmet/lifetime";
 * import { assert } from "@std/assert";
 *
 * // A hand-built panic with the same name is not one.
 * const lookalike = new Panic({
 * 	name: "SetupTeardownFailed",
 * 	message: "",
 * 	cause: null,
 * });
 * assert(!isSetupTeardownPanic(lookalike));
 * ```
 */
export function isSetupTeardownPanic(
	value: unknown,
): value is Panic<SetupTeardownFailure> {
	return SetupTeardownPanic.is(value);
}

/** `init`'s panic, or one carrying setup's teardown failures with it. */
function withSetupFailures<C>({
	init,
	report,
}: {
	readonly init: Panic<unknown>;
	readonly report: EndReport<SetupEnd<C>>;
}): Panic<unknown> {
	if (!isErr(report)) {
		return init;
	}
	return new SetupTeardownPanic({ init, teardown: unwrapErr(report).panics });
}

/**
 * Ends a `setup` that `init` gave another owner, with `Ended(cause)`. It
 * settles synchronously when setup's teardown does, so `using` still works.
 */
function endSetup<C>({
	setup,
	cause,
}: {
	readonly setup: Lifetime<undefined, SetupEnd<C>>;
	readonly cause: C;
}): void | Promise<void> {
	const ended = setup.end(new SetupEnd<C>("Ended", cause));
	if (isolate(ended.poll(), "Ready")) {
		return;
	}
	return ended.wait().then(() => {});
}
