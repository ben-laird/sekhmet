/**
 * The panic runtime: Rust's split between reporting a panic (the panic hook)
 * and recovering from one (`catch_unwind`), with no global state.
 *
 * Create a runtime with {@linkcode definePanicRuntime} and run your whole
 * program inside its {@linkcode PanicRuntime.catchUnwind} or
 * {@linkcode PanicRuntime.catchUnwindAsync}.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini/core";
import { Panic } from "./core.ts";

/**
 * What a {@linkcode PanicHook} receives about an unwind, like Rust's
 * `PanicHookInfo`.
 */
export interface PanicHookInfo {
	/** The thrown value, unchanged. Narrow it with `instanceof Panic`. */
	readonly payload: unknown;
	/**
	 * The stack captured where the payload was constructed, when the payload
	 * is an `Error` (a {@linkcode Panic} included); `undefined` otherwise.
	 */
	readonly stack: string | undefined;
}

/**
 * A reporting callback, like the closure given to Rust's
 * `std::panic::set_hook`. It observes an unwind and returns nothing; recovery
 * belongs to the boundary, never to the hook.
 *
 * A hook that throws is a panic while panicking: see
 * {@linkcode PanicRuntime.catchUnwind}.
 */
export type PanicHook = (info: PanicHookInfo) => void;

/**
 * The cause of the {@linkcode Panic} a boundary throws when its hook throws
 * while reporting an unwind. That Panic is named `Panic (PanicHook)`.
 */
export interface PanicHookFailure {
	/** The payload the hook was reporting. */
	readonly payload: unknown;
	/** What the hook threw. */
	readonly thrown: unknown;
}

/**
 * A panic runtime: one hook slot plus the boundaries that report through it.
 * Every runtime is independent; a hook set on one never sees another's
 * unwinds.
 *
 * Reporting is per runtime: the innermost boundary of a runtime that catches
 * an object payload reports it, and that runtime never reports it again. Each
 * other runtime the payload passes through reports it once through its own
 * hook. Payloads are never mutated; the record lives in the runtime.
 *
 * A primitive payload (a string, `undefined` and so on) cannot be recorded
 * without leaking or silencing a later, equal throw, so every boundary that
 * catches one reports it, even after {@linkcode PanicRuntime.resumeUnwind}.
 */
export interface PanicRuntime {
	/**
	 * Runs `fn` and catches every throw, like Rust's `catch_unwind`. The hook
	 * reports the payload first, unless it has already been reported.
	 *
	 * The payload is `unknown`, as Rust's is `Box<dyn Any>`: narrow it with
	 * `instanceof Panic`, and convert it to an app error with `mapErr`.
	 *
	 * If the hook throws, the boundary does not recover: it throws a
	 * `Panic (PanicHook)` whose cause is a {@linkcode PanicHookFailure}. That
	 * mirrors Rust aborting on a panic while panicking, without killing the
	 * host; an outer boundary reports and catches it as a new unwind.
	 *
	 * Async work belongs in {@linkcode PanicRuntime.catchUnwindAsync}: passing
	 * a function that returns a `PromiseLike` here is a type error ("Arguments
	 * for the rest parameter 'useCatchUnwindAsyncForPromises' were not
	 * provided"), since this boundary would return the promise as an `Ok` and
	 * miss its rejection. The check is type-only and costs nothing at runtime.
	 * It rejects a return type that is wholly `PromiseLike`; `any` and `never`
	 * pass.
	 *
	 * @template T The return type of `fn`
	 * @param fn The synchronous work to run
	 * @param useCatchUnwindAsyncForPromises Never passed; it exists only to
	 *   reject promise-returning `fn`s
	 * @returns `Ok` of the return value, or `Err` of the thrown payload
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { isErr } from "@sekhmet/enum/result/mini/predicates";
	 * import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
	 * import { assert, assertInstanceOf } from "@std/assert";
	 *
	 * const runtime = definePanicRuntime();
	 * runtime.setHook(() => {}); // keep the example quiet
	 *
	 * const result = runtime.catchUnwind(() => JSON.parse("{ not json"));
	 *
	 * assert(isErr(result));
	 * assertInstanceOf(unwrapErr(result), SyntaxError);
	 * ```
	 */
	readonly catchUnwind: <T>(
		fn: () => T,
		...useCatchUnwindAsyncForPromises: 0 extends 1 & T
			? []
			: [T] extends [never]
				? []
				: [T] extends [PromiseLike<unknown>]
					? [useCatchUnwindAsyncForPromises: never]
					: []
	) => Result<T, unknown>;
	/**
	 * The async form of {@linkcode PanicRuntime.catchUnwind}: it catches a
	 * rejection of the returned promise or thenable, a `then` that throws, and
	 * a synchronous throw from `fn` alike, so it never leaves an unhandled
	 * rejection. It rejects only when the hook throws, with the same
	 * `Panic (PanicHook)`.
	 *
	 * @template T The resolved type of `fn`'s promise or thenable
	 * @param fn The async work to run; any `PromiseLike` is accepted
	 * @returns A promise of `Ok` of the resolved value, or `Err` of the payload
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { Ok } from "@sekhmet/enum/result/mini/core";
	 * import { assertEquals } from "@std/assert";
	 *
	 * const runtime = definePanicRuntime();
	 *
	 * const result = await runtime.catchUnwindAsync(async () => 42);
	 *
	 * assertEquals(result, Ok(42));
	 * ```
	 */
	readonly catchUnwindAsync: <T>(
		fn: () => PromiseLike<T>,
	) => Promise<Result<T, unknown>>;
	/**
	 * Throws `payload` unchanged without reporting it, like Rust's
	 * `resume_unwind`. Use it to pass a caught payload on to an outer
	 * boundary. No boundary of this runtime reports an object payload it
	 * resumed; another runtime's boundary still reports it once. A primitive
	 * payload is reported by every boundary that catches it.
	 *
	 * @param payload The payload to re-throw, usually an `Err` from a boundary
	 * @returns Never; it always throws
	 */
	readonly resumeUnwind: (payload: unknown) => never;
	/**
	 * Replaces this runtime's hook, like Rust's `set_hook`. To chain, take the
	 * previous hook with {@linkcode PanicRuntime.takeHook} and call it from the
	 * new one.
	 *
	 * @param hook The new hook
	 */
	readonly setHook: (hook: PanicHook) => void;
	/**
	 * Removes this runtime's hook and returns it, restoring
	 * {@linkcode defaultPanicHook}, like Rust's `take_hook`.
	 *
	 * @returns The hook that was installed
	 */
	readonly takeHook: () => PanicHook;
}

/**
 * The hook every runtime starts with, like Rust's default hook: it writes
 * `panicked: …` to `console.error`, followed by the payload's stack when the
 * payload is an `Error`.
 *
 * @param info The unwind to report
 */
export const defaultPanicHook: PanicHook = ({ payload, stack }) => {
	if (stack !== undefined) {
		console.error(`panicked: ${stack}`);
	} else if (isObjectLike(payload)) {
		console.error("panicked:", payload);
	} else {
		console.error(`panicked: ${String(payload)}`);
	}
};

/**
 * Creates an independent panic runtime. Create one at your program's entry
 * point and run the whole program inside it; the package keeps no global or
 * module-level state, so there is no default runtime.
 *
 * @returns A runtime whose hook starts as {@linkcode defaultPanicHook}
 *
 * @example
 * ```ts
 * import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
 * import { Err } from "@sekhmet/enum/result/mini/core";
 * import { mapErr } from "@sekhmet/enum/result/mini/transform";
 * import { assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * const log: string[] = [];
 * runtime.setHook(() => log.push("reported")); // stands in for a real reporter
 *
 * // Chain: take the previous hook and call it from the new one
 * const previous = runtime.takeHook();
 * let panics = 0;
 * runtime.setHook((info) => {
 *   panics++;
 *   previous(info);
 * });
 *
 * const main = (): number => panic({ message: "no port", cause: null });
 * const result = mapErr(runtime.catchUnwind(main), (payload) =>
 *   payload instanceof Panic ? payload.message : "unknown failure",
 * );
 *
 * assertEquals(result, Err("no port"));
 * assertEquals([panics, log], [1, ["reported"]]);
 * ```
 */
export function definePanicRuntime(): PanicRuntime {
	let hook: PanicHook = defaultPanicHook;
	// Object payloads this runtime has reported or resumed; adding a Proxy runs no trap
	const reported = new WeakSet<object>();

	const markReported = (payload: unknown): void => {
		if (isObjectLike(payload)) {
			reported.add(payload);
		}
	};

	const report = (payload: unknown): void => {
		if (isObjectLike(payload) && reported.has(payload)) {
			return;
		}
		markReported(payload);

		const info: PanicHookInfo = { payload, stack: stackOf(payload) };
		try {
			hook(info);
		} catch (thrown: unknown) {
			throw new HookFailurePanic({ payload, thrown });
		}
	};

	return {
		// The guard rest is type-only: never passed, so never read
		catchUnwind: (fn, ..._useCatchUnwindAsyncForPromises) => {
			try {
				return Ok(fn());
			} catch (payload: unknown) {
				report(payload);
				return Err(payload);
			}
		},
		catchUnwindAsync: async <T>(
			fn: () => PromiseLike<T>,
		): Promise<Result<T, unknown>> => {
			try {
				return Ok(await fn());
			} catch (payload: unknown) {
				report(payload);
				return Err(payload);
			}
		},
		resumeUnwind: (payload: unknown): never => {
			markReported(payload);
			throw payload;
		},
		setHook: (next: PanicHook): void => {
			hook = next;
		},
		takeHook: (): PanicHook => {
			const taken = hook;
			hook = defaultPanicHook;
			return taken;
		},
	};
}

/**
 * Whether `payload` is the `Panic (PanicHook)` a boundary throws when its hook
 * throws. Use it to read the {@linkcode PanicHookFailure} cause without a
 * cast. A `Panic` built by hand with the same name and cause is not one.
 *
 * @param payload Any caught value
 * @returns True if a boundary threw `payload` because its hook threw
 *
 * @example
 * ```ts
 * import { definePanicRuntime, isPanicHookFailure, panic } from "@sekhmet/panic";
 * import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const outer = definePanicRuntime();
 * outer.setHook(() => {}); // keep the example quiet
 * const inner = definePanicRuntime();
 * inner.setHook(() => {
 *   throw new Error("reporter offline");
 * });
 *
 * const payload = unwrapErr(
 *   outer.catchUnwind(() =>
 *     inner.catchUnwind(() => panic({ message: "bad state", cause: null })),
 *   ),
 * );
 *
 * assert(isPanicHookFailure(payload));
 * assertEquals(String(payload.cause.thrown), "Error: reporter offline");
 * ```
 */
export function isPanicHookFailure(
	payload: unknown,
): payload is Panic<PanicHookFailure> {
	return HookFailurePanic.is(payload);
}

/** The `Panic (PanicHook)` a boundary throws; the private brand runs no Proxy trap. */
class HookFailurePanic extends Panic<PanicHookFailure> {
	constructor(cause: PanicHookFailure) {
		super({
			name: "PanicHook",
			message: "the panic hook threw while reporting a panic",
			cause,
		});
	}

	#brand = true;

	static is(value: unknown): value is HookFailurePanic {
		return isObjectLike(value) && #brand in value;
	}
}

function isObjectLike(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

/** Reads an Error payload's stack; a Proxy trap that throws yields `undefined`. */
function stackOf(payload: unknown): string | undefined {
	try {
		const stack = payload instanceof Error ? payload.stack : undefined;
		return typeof stack === "string" ? stack : undefined;
	} catch {
		return undefined;
	}
}
