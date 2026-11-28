/**
 * The panic runtime: Rust's split between reporting a panic (the panic hook)
 * and recovering from one (`catch_unwind`), with no global state.
 *
 * Create a runtime with {@linkcode definePanicRuntime} and run your whole
 * program inside its {@linkcode PanicRuntime.catchUnwind}, which settles a
 * `Vow` of an `Outcome` whether the program is sync or async.
 *
 * @module
 */

import type { Vow } from "@sekhmet/vow/mini/core";
import { resolved, vowWithResolver } from "@sekhmet/vow/mini/impl";
import { Ok, type Outcome, Panicked } from "@/src/outcome/mini/core.ts";
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
	 * It always returns a `Vow`, since a `Vow` means "sync or async, I don't
	 * know which". Sync work settles the vow before `catchUnwind` returns, so
	 * read it right after the call with `poll` from `@sekhmet/vow` and
	 * `expectReady` from `@sekhmet/enum/poll/mini`. Async work settles it
	 * later, and the vow's dependents then run inside this boundary: one that
	 * throws is reported through the hook. Each throw is reported on its own,
	 * not as the vow's `AggregateError`, so a dependent that rethrows a
	 * payload already reported (unwrapping a `Panicked`) is not reported
	 * again.
	 * The vow and the `Outcome` in it are the mini forms, from
	 * `@sekhmet/vow` and `@sekhmet/panic/outcome/mini`; a method-chaining
	 * main `Vow` waits on #111.
	 *
	 * A returned thenable is adopted, as `await` does: its value is the `Ok`,
	 * and its rejection, or a `then` that throws, is `Panicked`, matching
	 * "throw means panic". A thenable it fulfils with is followed in turn,
	 * and only the first callback of each counts. Its `then` is called at
	 * once rather than on a microtask, so one that calls back synchronously
	 * settles the vow at once. A sync function that returns a thenable as
	 * data is flattened too. To keep one as a value, box it
	 * (`() => ({ thenable })`). An expected failure is classified at the
	 * edge: return a `Result` (`promise.then(Ok, Err)`), and flatten the
	 * caught `Result` into the `Outcome` with `fromCaught`.
	 *
	 * The payload is `unknown`, as Rust's is `Box<dyn Any>`: narrow it with
	 * `instanceof Panic` or `isPanicAnd`, and turn it into an app error with
	 * `recover`. A boundary settles an `Outcome`, never a `Result`: its `Err`
	 * channel is `never`, since a boundary catches only throws.
	 *
	 * If the hook throws while reporting a payload of sync work, the
	 * boundary does not recover: it throws a `Panic (PanicHook)` whose cause
	 * is a {@linkcode PanicHookFailure}. That mirrors Rust aborting on a
	 * panic while panicking, without killing the host; an outer boundary
	 * reports and catches it as a new unwind.
	 *
	 * Async work has no caller to throw to, and a `Vow` cannot reject. So
	 * when the hook throws while reporting a rejection, the vow still
	 * settles as `Panicked` with the payload, and the `Panic (PanicHook)`
	 * then escapes the settle callback as an unhandled rejection, which
	 * crashes the process under the Deno and Node defaults. The same goes
	 * for a hook that throws while reporting a throwing dependent. This is
	 * deliberate, and a change from the old `catchUnwindAsync`, which
	 * rejected its promise. The default hook never throws. A thenable that
	 * rejects inside its own `then` call, or a `then` that throws, has a
	 * caller: then the `Panic (PanicHook)` escapes `catchUnwind` itself.
	 *
	 * @template T The value `fn` returns, or its thenable fulfils with
	 * @param fn The work to run, sync or async
	 * @returns A vow of `Ok` of the value, or `Panicked` of the payload;
	 *   settled already when `fn` was sync
	 *
	 * @example
	 * ```ts
	 * import { definePanicRuntime } from "@sekhmet/panic";
	 * import { expectReady } from "@sekhmet/enum/poll/mini";
	 * import { isPanicked, Ok, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
	 * import { poll, wait } from "@sekhmet/vow";
	 * import { assert, assertEquals, assertInstanceOf } from "@std/assert";
	 *
	 * const runtime = definePanicRuntime();
	 * runtime.setHook(() => {}); // keep the example quiet
	 *
	 * // Sync work: settled before catchUnwind returns
	 * const parsed = runtime.catchUnwind(() => JSON.parse("{ not json"));
	 * const result = expectReady(poll(parsed), "sync work settles at once");
	 * assert(isPanicked(result));
	 * assertInstanceOf(unwrapPanicked(result), SyntaxError);
	 *
	 * // Async work: the returned promise is adopted
	 * assertEquals(await wait(runtime.catchUnwind(async () => 42)), Ok(42));
	 * ```
	 */
	readonly catchUnwind: <T>(
		fn: () => T | PromiseLike<T>,
	) => Vow<Outcome<T, never, unknown>>;
	/**
	 * Throws `payload` unchanged without reporting it, like Rust's
	 * `resume_unwind`. Use it to pass a caught payload on to an outer
	 * boundary. No boundary of this runtime reports an object payload it
	 * resumed; another runtime's boundary still reports it once. A primitive
	 * payload is reported by every boundary that catches it.
	 *
	 * @param payload The payload to re-throw, usually a `Panicked` payload from a boundary
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
 * The part of a {@linkcode PanicRuntime} that code running user callbacks
 * needs: catching a panic ({@linkcode PanicRuntime.catchUnwind}) and passing
 * a caught payload on ({@linkcode PanicRuntime.resumeUnwind}). It is the
 * runtime itself, narrowed: pass the runtime as is (`{ panics: runtime }`).
 * It is least privilege, since code under a boundary can catch, report
 * through the app's hook and resume, but never replace the hook.
 *
 * The panic protocol: a panic propagates, unless your code runs on a stack
 * nobody's waiting on. Then the API takes a `PanicBoundary`, which catches
 * the panic, reports it once and hands back a `Vow<Outcome>`. From there it is
 * a `Panicked` value that combinators pass through untouched.
 *
 * 1. Propagate by default: code that runs a callback synchronously, inside
 *    its caller's own call, lets a panic propagate and takes no boundary.
 * 2. Catch only where no caller is waiting: an API that runs user code later
 *    (from a timer or scheduler, from another party's call, inside a promise
 *    callback) takes `panics: PanicBoundary`.
 * 3. Never catch without reporting: code without a boundary never catches a
 *    panic into an `Outcome`, since an unreported `Panicked` that is dropped
 *    vanishes silently.
 * 4. The boundary that catches a panic reports it, exactly once, and hands
 *    back a `Vow<Outcome<T, never, unknown>>`.
 * 5. After that, a panic is a value: `Outcome`'s `Panicked(payload)`, or a
 *    variant named `Panicked` with an `unknown` payload in an enum with its
 *    own terminal for it.
 * 6. Combinators pass `Panicked` through untouched: they never convert it to
 *    an error, swallow it, or report it again.
 * 7. Unwrapping a `Panicked` rethrows the same payload (`resumeUnwind`), so
 *    it isn't reported twice.
 * 8. No ambient or global runtime.
 *
 * @example
 * ```ts
 * import { definePanicRuntime, type PanicBoundary } from "@sekhmet/panic";
 *
 * const runtime = definePanicRuntime();
 * const panics: PanicBoundary = runtime;
 * ```
 */
export type PanicBoundary = Pick<PanicRuntime, "catchUnwind" | "resumeUnwind">;

/**
 * The hook every runtime starts with, like Rust's default hook: it writes a
 * `panicked: …` report to `console.error`.
 *
 * For an `Error` payload (a {@linkcode Panic} included) the report is
 * `panicked: <name>: <message>` (`panicked: <name>` when the message is
 * empty), then the stack frames on the lines below. The header comes from the
 * payload itself, so it reads the same on every engine: V8 and Bun open a
 * stack with a header line of their own, which is dropped, while Firefox and
 * WebKit stacks hold only frames. Any other object is handed to the console
 * to format, and a primitive is printed as a string.
 *
 * @param info The unwind to report
 */
export const defaultPanicHook: PanicHook = ({ payload, stack }) => {
	if (stack !== undefined) {
		console.error(`panicked: ${errorReport({ payload, stack })}`);
	} else if (isObjectLike(payload)) {
		console.error("panicked:", payload);
	} else {
		console.error(`panicked: ${String(payload)}`);
	}
};

/** An `Error` payload's header, read so that a Proxy trap cannot throw. */
function headerOf(
	payload: unknown,
): { header: string; message: string } | undefined {
	try {
		if (!(payload instanceof Error)) return undefined;
		const { name, message } = payload;
		return { header: message === "" ? name : `${name}: ${message}`, message };
	} catch {
		return undefined;
	}
}

/**
 * Drops the header V8 and Bun put at the top of a stack. It is found by the
 * message, not by line, so a multi-line message is dropped whole, and not by
 * the name, which Bun records as `Error` for a subclass with a name getter.
 */
function framesOf({
	stack,
	message,
}: {
	stack: string;
	message: string;
}): string {
	if (message === "") {
		const [first = "", ...rest] = stack.split("\n");
		return /^\s+at |@/.test(first) ? stack : rest.join("\n");
	}
	const marker = `: ${message}`;
	const at = stack.indexOf(marker);
	return at >= 0 && !stack.slice(0, at).includes("\n")
		? stack.slice(at + marker.length).replace(/^\n/, "")
		: stack;
}

/** The `Error` report: the payload's own header, then the stack frames. */
function errorReport({
	payload,
	stack,
}: {
	payload: unknown;
	stack: string;
}): string {
	const header = headerOf(payload);
	if (header === undefined) return stack;
	const frames = framesOf({ stack, message: header.message }).trimEnd();
	return frames === "" ? header.header : `${header.header}\n${frames}`;
}

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
 * import { Err as ResultErr } from "@sekhmet/enum/result/mini/core";
 * import { intoInner } from "@sekhmet/enum/either/mini";
 * import { expectReady } from "@sekhmet/enum/poll/mini";
 * import { Err, mapErr, recover } from "@sekhmet/panic/outcome/mini";
 * import { poll } from "@sekhmet/vow";
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
 * const exit = expectReady(poll(runtime.catchUnwind(main)), "main is sync");
 * const recovered = recover(exit, (payload) => {
 *   return ResultErr(payload instanceof Panic ? payload.message : "unknown failure");
 * });
 * // A boundary has no error of its own, so the Either holds only the app error
 * const result = mapErr(recovered, intoInner);
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
		catchUnwind: <T>(
			fn: () => T | PromiseLike<T>,
		): Vow<Outcome<T, never, unknown>> => {
			let returned: PromiseLike<T>;
			try {
				const value = fn();
				// Reading `then` runs user code too (a getter, a Proxy trap)
				if (!isThenable(value)) return resolved(Ok(value));
				returned = value;
			} catch (payload: unknown) {
				report(payload);
				return resolved(Panicked(payload));
			}

			const { vow, resolve } = vowWithResolver<Outcome<T, never, unknown>>();
			adopt({
				thenable: returned,
				report,
				// A dependent that throws is a panic with no caller: report it
				settle: (outcome) => {
					try {
						resolve(outcome);
					} catch (thrown: unknown) {
						reportEach({ thrown, report });
					}
				},
			});
			return vow;
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
 * import { expectReady } from "@sekhmet/enum/poll/mini";
 * import { unwrapPanicked } from "@sekhmet/panic/outcome/mini";
 * import { poll } from "@sekhmet/vow";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const outer = definePanicRuntime();
 * outer.setHook(() => {}); // keep the example quiet
 * const inner = definePanicRuntime();
 * inner.setHook(() => {
 *   throw new Error("reporter offline");
 * });
 *
 * // The inner hook throws, so the inner boundary throws Panic (PanicHook)
 * const caught = outer.catchUnwind(() => {
 *   return inner.catchUnwind(() => panic({ message: "bad state", cause: null }));
 * });
 * const payload = unwrapPanicked(expectReady(poll(caught), "sync work"));
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

/**
 * Reports what a vow's `resolve` threw: the `AggregateError` of its
 * dependents' throws, entry by entry, so a payload already reported (a
 * dependent that unwrapped a `Panicked`) is not reported again. Every entry
 * is reported even if the hook throws; the first such failure is rethrown.
 */
function reportEach({
	thrown,
	report,
}: {
	readonly thrown: unknown;
	readonly report: (payload: unknown) => void;
}): void {
	const entries = thrown instanceof AggregateError ? thrown.errors : [thrown];
	let doubleFault: { readonly thrown: unknown } | undefined;
	for (const entry of entries) {
		try {
			report(entry);
		} catch (failure: unknown) {
			doubleFault ??= { thrown: failure };
		}
	}
	if (doubleFault !== undefined) throw doubleFault.thrown;
}

/**
 * Adopts `thenable` as `await` does: it calls `then` once, follows a
 * thenable it fulfils with, and heeds only the first callback of each. A
 * rejection, or a `then` that throws, is reported and settled as `Panicked`.
 * If the hook throws, the vow still settles, then the `Panic (PanicHook)`
 * escapes the callback, as an unhandled rejection in a promise's. When the
 * callback ran inside `then` itself (a thenable that rejects at once, or a
 * `then` that throws), it escapes `catchUnwind`, as sync work's does.
 */
function adopt<T>({
	thenable,
	settle,
	report,
}: {
	readonly thenable: PromiseLike<T>;
	readonly settle: (outcome: Outcome<T, never, unknown>) => void;
	readonly report: (payload: unknown) => void;
}): void {
	const fail = (payload: unknown): void => {
		let doubleFault: { readonly thrown: unknown } | undefined;
		try {
			report(payload);
		} catch (thrown: unknown) {
			doubleFault = { thrown };
		}
		settle(Panicked(payload));
		if (doubleFault !== undefined) throw doubleFault.thrown;
	};
	const follow = (next: PromiseLike<T>): void => {
		let called = false;
		const fulfil = (value: T): void => {
			if (called) return;
			called = true;
			let nested: PromiseLike<T> | undefined;
			try {
				nested = isThenable(value) ? value : undefined;
			} catch (payload: unknown) {
				fail(payload);
				return;
			}
			if (nested === undefined) {
				settle(Ok(value));
			} else {
				follow(nested);
			}
		};
		const reject = (payload: unknown): void => {
			if (called) return;
			called = true;
			fail(payload);
		};
		// A throw out of our own callbacks (a double fault) is never `then`'s
		let escaped: { readonly thrown: unknown } | undefined;
		const own = <A>(callback: (arg: A) => void): ((arg: A) => void) => {
			return (arg) => {
				try {
					callback(arg);
				} catch (thrown: unknown) {
					escaped ??= { thrown };
					throw thrown;
				}
			};
		};
		try {
			void next.then(own(fulfil), own(reject));
		} catch (payload: unknown) {
			if (escaped !== undefined) throw escaped.thrown;
			reject(payload);
		}
	};
	follow(thenable);
}

/** Whether `value` is a thenable, as `await` treats it: a callable `then`. */
function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		isObjectLike(value) && typeof Reflect.get(value, "then") === "function"
	);
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
