/**
 * How a parse runs: user code under a panic boundary (`panics.catchUnwind`,
 * its caught `Result` flattened with `fromCaught`), as a {@linkcode Parsing}
 * (a `Vow` of an `Outcome`) that settles synchronously when the code was
 * synchronous, and continued with {@linkcode proceed}, which passes a panic
 * through. Internal: not exported from the mini barrel.
 *
 * Every callback a parse hands to a vow continuation runs under the
 * boundary ({@linkcode step}, through `proceed`, or `catchUnwind` itself),
 * so none throws inside a vow's `resolve`, where the throw would be lost and
 * the parse would never settle. That covers internal code too, which can
 * throw when it reads a user value (a getter, a Proxy trap).
 *
 * One throw escapes by design: a panic hook that throws while reporting (a
 * `Panic (PanicHook)`) escapes every boundary, as the panic runtime's
 * contract says. In a synchronous parse it unwinds to the caller; in an
 * async one the parse still settles as `Panicked`, and the hook's failure
 * surfaces as an unhandled rejection.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import type { Result } from "@sekhmet/enum/result/mini";
import type { PanicBoundary } from "@sekhmet/panic/mini/runtime";
import { fromResult } from "@sekhmet/panic/outcome/mini/convert";
import { type Outcome, Panicked } from "@sekhmet/panic/outcome/mini/core";
import type { Vow } from "@sekhmet/vow/mini/core";
import { andThen, resolved } from "@sekhmet/vow/mini/impl";
import type { MaybePromise } from "./schema.ts";

/**
 * A parse, settled or in flight: `Ok(output)`, the expected `Err(error)`,
 * or `Panicked` with what user code threw or rejected with.
 */
export type Parsing<O, E> = Vow<Outcome<O, E, unknown>>;

/** A parse already settled with `result`. */
export function settled<O, E>(result: Result<O, E>): Parsing<O, E> {
	return resolved(fromResult(result));
}

/** A parse already settled as a panic with `payload`. */
export function panicked<O, E>(payload: unknown): Parsing<O, E> {
	return resolved(Panicked<O, E, unknown>(payload));
}

/**
 * Whether a value is promise-like: an object or function with a callable
 * `then`, as `await` and `Promise.resolve` treat it.
 */
export function isPromiseLike<T>(
	value: MaybePromise<T>,
): value is PromiseLike<T> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}

/**
 * Runs the work that builds a parse under `panics`: a throw, from user code
 * it calls or a user value it reads, settles the parse as `Panicked` with
 * the payload unchanged.
 */
export function step<O, E>({
	panics,
	work,
}: {
	readonly panics: PanicBoundary;
	readonly work: () => Parsing<O, E>;
}): Parsing<O, E> {
	// A Parsing is a vow, never a thenable, so catchUnwind hands it back as is
	return andThen(panics.catchUnwind(work), (built) => {
		return match(built)<Parsing<O, E>>({
			Ok: (parsing) => parsing,
			Err: (impossible) => impossible,
			Panicked: (payload) => panicked(payload),
		});
	});
}

/** What {@linkcode proceed} does with a parse's output, or its error. */
export interface Continuation<O, E, P, F> {
	/** The boundary each continuation runs under. */
	readonly panics: PanicBoundary;
	/** Continues from the output. */
	readonly Ok: (output: O) => Parsing<P, F>;
	/** Continues from the expected error. */
	readonly Err: (error: E) => Parsing<P, F>;
}

/**
 * Continues a parse once it settles: its output or its error goes to `next`,
 * under `next.panics`, and a panic passes through untouched.
 */
export function proceed<O, E, P, F>(
	self: Parsing<O, E>,
	next: Continuation<O, E, P, F>,
): Parsing<P, F> {
	const { panics } = next;

	return andThen(self, (outcome) => {
		return step({
			panics,
			work: () => {
				return match(outcome)<Parsing<P, F>>({
					Ok: (output) => next.Ok(output),
					Err: (error) => next.Err(error),
					Panicked: (payload) => panicked(payload),
				});
			},
		});
	});
}
