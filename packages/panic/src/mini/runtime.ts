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
	 * Use {@linkcode PanicRuntime.catchUnwindAsync} for async work: a promise
	 * returned here is just an `Ok` value.
	 *
	 * @template T The return type of `fn`
	 * @param fn The work to run
	 * @returns `Ok` of the return value, or `Err` of the thrown payload
	 *
	 * @example
	 * ```ts ignore
	 * const result = runtime.catchUnwind(() => JSON.parse(text));
	 * ```
	 */
	readonly catchUnwind: <T>(fn: () => T) => Result<T, unknown>;
	/**
	 * The async form of {@linkcode PanicRuntime.catchUnwind}: it catches a
	 * rejection of the returned promise and a synchronous throw from `fn`
	 * alike, so it never leaves an unhandled rejection. It rejects only when
	 * the hook throws, with the same `Panic (PanicHook)`.
	 *
	 * @template T The resolved type of `fn`'s promise
	 * @param fn The async work to run
	 * @returns A promise of `Ok` of the resolved value, or `Err` of the payload
	 *
	 * @example
	 * ```ts ignore
	 * const result = await runtime.catchUnwindAsync(() => fetch(url));
	 * ```
	 */
	readonly catchUnwindAsync: <T>(
		fn: () => Promise<T>,
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
 * ```ts ignore
 * import { definePanicRuntime, Panic } from "@sekhmet/panic";
 * import { mapErr } from "@sekhmet/enum/result/mini/transform";
 *
 * const runtime = definePanicRuntime();
 *
 * const previous = runtime.takeHook();
 * runtime.setHook((info) => {
 *   metrics.increment("panics");
 *   previous(info);
 * });
 *
 * const result = mapErr(runtime.catchUnwind(main), (payload) =>
 *   payload instanceof Panic ? payload.message : "unknown failure",
 * );
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
			throw new Panic<PanicHookFailure>({
				name: "PanicHook",
				message: "the panic hook threw while reporting a panic",
				cause: { payload, thrown },
			});
		}
	};

	return {
		catchUnwind: <T>(fn: () => T): Result<T, unknown> => {
			try {
				return Ok(fn());
			} catch (payload: unknown) {
				report(payload);
				return Err(payload);
			}
		},
		catchUnwindAsync: async <T>(
			fn: () => Promise<T>,
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
