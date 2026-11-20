/**
 * How a parse runs: user code under a panic boundary ({@linkcode guard}),
 * lifted into a {@linkcode Parsing} (a `Vow` of an `Outcome`) that settles
 * synchronously when the code was synchronous, and continued with
 * {@linkcode proceed}, which passes a panic through. Internal: not exported
 * from the mini barrel.
 *
 * Every callback a parse hands to a vow continuation runs under the
 * boundary ({@linkcode step}, through `proceed`, `guard` or `parse`), so
 * none throws inside a vow's `resolve`, where the throw would be lost and the
 * parse would never settle. That covers internal code too, which can throw
 * when it reads a user value (a getter, a Proxy trap).
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import type { Result } from "@sekhmet/enum/result/mini";
import { fromResult } from "@sekhmet/panic/outcome/mini/convert";
import { type Outcome, Panicked } from "@sekhmet/panic/outcome/mini/core";
import type { Vow } from "@sekhmet/vow/mini/core";
import { andThen, resolved, vowWithResolver } from "@sekhmet/vow/mini/impl";
import type { MaybePromise, PanicBoundary } from "./schema.ts";

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
 * Runs user code that returns a `Result` (or a promise of one) under
 * `panics`: a throw, or a rejection of the promise, settles the parse as
 * `Panicked`. A synchronous `Result` settles it synchronously.
 */
export function guard<O, E>({
	panics,
	work,
}: {
	readonly panics: PanicBoundary;
	readonly work: () => MaybePromise<Result<O, E>>;
}): Parsing<O, E> {
	// Boxed, so catchUnwind's promise guard sees an object, not a maybe-promise.
	const caught = panics.catchUnwind(() => ({ returned: work() }));

	return match(caught)<Parsing<O, E>>({
		Ok: ({ returned }) => {
			if (isPromiseLike(returned)) return later({ panics, promise: returned });

			return settled(returned);
		},
		Err: (impossible) => impossible,
		Panicked: (payload) => panicked(payload),
	});
}

/** A parse that settles when `promise` does, a rejection as `Panicked`. */
function later<O, E>({
	panics,
	promise,
}: {
	readonly panics: PanicBoundary;
	readonly promise: PromiseLike<Result<O, E>>;
}): Parsing<O, E> {
	const { vow, resolve } = vowWithResolver<Outcome<O, E, unknown>>();
	const deliver = (outcome: Outcome<O, E, unknown>): void => {
		// The vow settles first; a continuation that throws is reported, not lost.
		panics.catchUnwind(() => resolve(outcome));
	};

	void panics
		.catchUnwindAsync(() => promise)
		.then(
			(caught) => {
				deliver(
					match(caught)<Outcome<O, E, unknown>>({
						Ok: (result) => fromResult(result),
						Err: (impossible) => impossible,
						Panicked: (payload) => Panicked(payload),
					}),
				);
			},
			(doubleFault: unknown) => deliver(Panicked(doubleFault)),
		);

	return vow;
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
	// Boxed, so catchUnwind's promise guard sees an object, not a maybe-promise.
	const caught = panics.catchUnwind(() => ({ parsing: work() }));

	return match(caught)<Parsing<O, E>>({
		Ok: ({ parsing }) => parsing,
		Err: (impossible) => impossible,
		Panicked: (payload) => panicked(payload),
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
