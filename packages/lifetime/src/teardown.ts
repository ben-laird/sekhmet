/**
 * The machinery of teardown, private to the package: running one cleanup
 * inside the panic boundaries, settling a vow from a promise continuation
 * without ever throwing into it, and turning a failed report into a
 * `SuppressedError` chain at the `using` boundary.
 *
 * @module
 */

import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { Panic } from "@sekhmet/panic";
import {
	isPanicked,
	unwrap as unwrapOutcome,
	unwrapPanicked,
} from "@sekhmet/panic/outcome/mini";
import { resolved, type Vow, vowWithResolver } from "@sekhmet/vow/mini";
import { invariant } from "@sekhmet/workflow/invariant";
import type { LifetimePanics } from "./lifetime.ts";
import type { EndReport } from "./phase.ts";

/**
 * Wraps a caught payload as a `Panic`, keeping one that already is.
 *
 * @internal
 */
export function asPanic({
	payload,
	name,
}: {
	readonly payload: unknown;
	readonly name: string;
}): Panic<unknown> {
	if (payload instanceof Panic) {
		return payload;
	}
	return new Panic({
		name,
		message: payload instanceof Error ? payload.message : String(payload),
		cause: payload,
	});
}

/**
 * Resolves `resolve` with `value` from a promise continuation, where nothing
 * may throw: a throwing dependent is reported through `catchUnwind`, and a
 * double fault (the hook throwing too) has no caller to reach.
 *
 * @internal
 */
export function deliver<T>({
	resolve,
	value,
	panics,
}: {
	readonly resolve: (value: T) => void;
	readonly value: T;
	readonly panics: LifetimePanics;
}): void {
	try {
		panics.catchUnwind(() => {
			resolve(value);
		});
	} catch {
		// A double fault in a promise continuation: rethrowing would only make
		// an unhandled rejection, and the hook that would report it just threw.
	}
}

/**
 * Runs one cleanup inside the panic boundaries: a throw or a rejection
 * becomes a `Panic (CleanupFailed)` (a payload that is already a `Panic`
 * stays as it is). It settles synchronously when the cleanup is sync.
 *
 * It throws only on a synchronous double fault: when the hook throws while
 * reporting a sync cleanup's throw, `catchUnwind` throws a
 * `Panic (PanicHook)`, and this lets it through for the caller to place. An
 * asynchronous double fault becomes the cleanup's panic instead, since it
 * surfaces in a promise continuation, where a throw would be an unhandled
 * rejection.
 *
 * @internal
 */
export function runCleanup({
	cleanup,
	panics,
}: {
	readonly cleanup: () => void | PromiseLike<void>;
	readonly panics: LifetimePanics;
}): Vow<Result<void, Panic<unknown>>> {
	// Boxed, so catchUnwind's promise guard sees an object, not a maybe-promise.
	const caught = panics.catchUnwind(() => ({ returned: cleanup() }));
	if (isPanicked(caught)) {
		return resolved(cleanupFailed(unwrapPanicked(caught)));
	}
	const { returned } = unwrapOutcome(caught);
	if (!isThenable(returned)) {
		return resolved<Result<void, Panic<unknown>>>(Ok(undefined));
	}
	const { vow, resolve } = vowWithResolver<Result<void, Panic<unknown>>>();
	const settling = panics.catchUnwindAsync(() => returned);
	void settling.then(
		(settled) => {
			if (isPanicked(settled)) {
				deliver({
					resolve,
					panics,
					value: cleanupFailed(unwrapPanicked(settled)),
				});
				return;
			}
			deliver({ resolve, panics, value: Ok(undefined) });
		},
		(doubleFault: unknown) => {
			deliver({ resolve, panics, value: cleanupFailed(doubleFault) });
		},
	);
	return vow;
}

function cleanupFailed(payload: unknown): Result<void, Panic<unknown>> {
	return Err(asPanic({ payload, name: "CleanupFailed" }));
}

/**
 * Whether `value` is a promise or another thenable.
 *
 * @internal
 */
export function isThenable<T>(
	value: T | PromiseLike<T>,
): value is PromiseLike<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}

/**
 * At the `using` boundary only: a failed report becomes a throw. One panic
 * is thrown as it is; several are chained as `SuppressedError`s, the latest
 * outermost, as the spec chains disposal errors.
 *
 * @internal
 */
export function throwIfFailed<C>(report: EndReport<C>): void {
	if (!isErr(report)) {
		return;
	}
	const [first, ...rest] = unwrapErr(report).panics;
	invariant(first !== undefined, {
		expectedBehavior: "a failed end report should hold at least one panic",
	});
	throw rest.reduce<unknown>((suppressed, error) => {
		return suppressedError({ error, suppressed });
	}, first);
}

/**
 * A `SuppressedError`: the platform's where it has one, and an `Error` of
 * the same shape where it doesn't (Safari before 27.3). It never installs a
 * global.
 *
 * @internal
 */
export function suppressedError({
	error,
	suppressed,
}: {
	readonly error: unknown;
	readonly suppressed: unknown;
}): Error {
	const message = "a cleanup failed after an earlier one had";
	const Native: unknown = Reflect.get(globalThis, "SuppressedError");
	if (typeof Native === "function") {
		return new globalThis.SuppressedError(error, suppressed, message);
	}
	return new SuppressedErrorPonyfill({ error, suppressed, message });
}

/** `SuppressedError`'s shape, for runtimes that lack it. */
class SuppressedErrorPonyfill extends Error {
	readonly error: unknown;
	readonly suppressed: unknown;

	constructor({
		error,
		suppressed,
		message,
	}: {
		readonly error: unknown;
		readonly suppressed: unknown;
		readonly message: string;
	}) {
		super(message);
		this.name = "SuppressedError";
		this.error = error;
		this.suppressed = suppressed;
	}
}

/**
 * The well-known symbols `using` and `await using` call, as a runtime may
 * or may not define them: pass the global `Symbol`.
 *
 * @internal
 */
export interface DisposalSymbols {
	readonly dispose?: unknown;
	readonly asyncDispose?: unknown;
}

/**
 * Installs `dispose` and `asyncDispose` on `target` under the runtime's
 * `Symbol.dispose` and `Symbol.asyncDispose`, each only where the runtime
 * defines that symbol. It never installs a symbol of its own.
 *
 * @internal
 */
export function installDisposers({
	target,
	symbols,
	dispose,
	asyncDispose,
}: {
	readonly target: object;
	readonly symbols: DisposalSymbols;
	readonly dispose: unknown;
	readonly asyncDispose: unknown;
}): void {
	const install = ({ key, value }: { key: unknown; value: unknown }): void => {
		if (typeof key === "symbol") {
			Object.defineProperty(target, key, {
				value,
				writable: true,
				configurable: true,
			});
		}
	};
	install({ key: symbols.dispose, value: dispose });
	install({ key: symbols.asyncDispose, value: asyncDispose });
}
