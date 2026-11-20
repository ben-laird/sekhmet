/**
 * The panic channel, the only functions that see a `Panicked`: `mapPanic`,
 * `inspectPanic`, `panicked`, `expectPanicked`, `unwrapPanicked`, `recover`
 * and `resume`.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini/exit";
import {
	assertIsolated,
	inspectIsolated,
} from "@sekhmet/enum/core/mini/isolate";
import { type Either, Left, Right } from "@sekhmet/enum/either/mini/core";
import { None, type Option, Some } from "@sekhmet/enum/option/mini/core";
import {
	type Result,
	Err as ResultErr,
	Ok as ResultOk,
} from "@sekhmet/enum/result/mini/core";
import { Err, Ok, type Outcome, Panicked } from "./core.ts";

/**
 * Maps an Outcome's panic payload by applying a function to it. `Ok` and
 * `Err` pass through unchanged.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the original panic payload
 * @template Q The type of the mapped panic payload
 * @param self The Outcome to map
 * @param mapping A function that transforms the payload
 * @returns The Outcome with its payload mapped if Panicked, otherwise unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, type Outcome, Panicked, mapPanic } from "@sekhmet/panic/outcome/mini";
 *
 * const describe = (payload: unknown): string => String(payload);
 * const bug: Outcome<number, string> = Panicked(404);
 *
 * assertEquals(mapPanic(bug, describe), Panicked("404"));
 * assertEquals(mapPanic(Ok(1), describe), Ok(1));
 * ```
 */
export function mapPanic<T, E, P, Q>(
	self: Outcome<T, E, P>,
	mapping: (payload: P) => Q,
): Outcome<T, E, Q> {
	return match(self)({
		Ok: (value) => Ok<T, E, Q>(value),
		Err: (error) => Err<T, E, Q>(error),
		Panicked: (payload) => Panicked<T, E, Q>(mapping(payload)),
	});
}

/**
 * Calls a function with the panic payload, if Panicked, and returns the
 * Outcome itself, so calls chain. Use it to log a panic without handling it.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to inspect
 * @param inspector A function that receives the payload
 * @returns `self`, unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, type Outcome, Panicked, inspectPanic } from "@sekhmet/panic/outcome/mini";
 *
 * const seen: unknown[] = [];
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(inspectPanic(bug, (p) => seen.push(p)), bug);
 * inspectPanic(Ok(1), (p) => seen.push(p)); // does nothing
 * assertEquals(seen, ["boom"]);
 * ```
 */
export function inspectPanic<T, E, P>(
	self: Outcome<T, E, P>,
	inspector: (payload: P) => void,
): Outcome<T, E, P> {
	inspectIsolated(self, "Panicked", inspector);

	return self;
}

/**
 * Converts an Outcome to an Option of its panic payload: `Panicked(p)`
 * becomes `Some(p)`, and `Ok` and `Err` become `None`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to convert
 * @returns Some holding the payload if Panicked, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { Err, Panicked, panicked } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(panicked(Panicked("boom"))), "boom");
 * assertEquals(isNone(panicked(Err("failed"))), true);
 * ```
 */
export function panicked<T, E, P>(self: Outcome<T, E, P>): Option<P> {
	return match(self)({
		Ok: () => None<P>(),
		Err: () => None<P>(),
		Panicked: (payload) => Some(payload),
	});
}

/**
 * Returns the panic payload, or throws with a custom message if the Outcome
 * is Ok or Err.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @param message The message to throw if the Outcome is not Panicked
 * @returns The panic payload
 * @throws Error with the provided message if the Outcome is Ok or Err
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Ok, Panicked, expectPanicked } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(expectPanicked(Panicked("boom"), "should have thrown"), "boom");
 * assertThrows(() => expectPanicked(Ok(1), "should have thrown"), Error, "should have thrown");
 * ```
 */
export function expectPanicked<T, E, P>(
	self: Outcome<T, E, P>,
	message: string,
): P {
	assertIsolated(self, "Panicked", message);

	return union(self);
}

/**
 * Returns the panic payload, or throws if the Outcome is Ok or Err.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to unwrap
 * @returns The panic payload
 * @throws Error if the Outcome is Ok or Err
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Ok, Panicked, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrapPanicked(Panicked("boom")), "boom");
 * assertThrows(() => unwrapPanicked(Ok(1)), Error, "Outcome unwrap failed!");
 * ```
 */
export function unwrapPanicked<T, E, P>(self: Outcome<T, E, P>): P {
	return expectPanicked(self, "Outcome unwrap failed!");
}

/**
 * Recovers from a panic, the way `catch_unwind` does at a boundary: a
 * `Panicked` becomes the `Ok` or `Err` that `handler` returns for its
 * payload. `Ok` and `Err` pass through unchanged. The handler is user code,
 * so it returns a `Result`; the Outcome it leaves has no panic left in it,
 * and `intoResult` turns it into a `Result`.
 *
 * The two error sources stay apart, as in `flattenResult`: the Outcome's own
 * error becomes `Left`, and the handler's `Right`. A boundary's
 * `Outcome<T, never, unknown>` recovers into an
 * `Outcome<T, Either<never, F>, never>`; call `intoInner` on the `Either` for
 * a plain `F`.
 *
 * @template T The type of the success value
 * @template E The type of the Outcome's own error
 * @template P The type of the panic payload
 * @template F The type of the error the handler returns
 * @param self The Outcome to recover
 * @param handler A function that turns the payload into a Result
 * @returns The Outcome's Ok, or its Err as Left; for a panic, the handler's Ok, or its Err as Right
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { intoInner, isRight } from "@sekhmet/enum/either/mini";
 * import { Err as ResultErr } from "@sekhmet/enum/result/mini";
 * import { Ok, type Outcome, Panicked, recover, unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
 *
 * const toError = (payload: unknown) => ResultErr(`bug: ${String(payload)}`);
 * const bug: Outcome<number, string> = Panicked("boom");
 * const ok: Outcome<number, string> = Ok(1);
 *
 * const error = unwrapErr(recover(bug, toError));
 * assertEquals(isRight(error), true); // it came from the handler
 * assertEquals(intoInner(error), "bug: boom");
 * assertEquals(unwrap(recover(ok, toError)), 1);
 * ```
 */
export function recover<T, E, P, F>(
	self: Outcome<T, E, P>,
	handler: (payload: P) => Result<T, F>,
): Outcome<T, Either<E, F>, never> {
	type Recovered = Outcome<T, Either<E, F>, never>;

	return match(self)({
		Ok: (value): Recovered => Ok(value),
		Err: (error): Recovered => Err(Left(error)),
		Panicked: (payload): Recovered => {
			return match(handler(payload))({
				Ok: (value): Recovered => Ok(value),
				Err: (error): Recovered => Err(Right(error)),
			});
		},
	});
}

/**
 * Resumes a panic, like Rust's `resume_unwind`: if the Outcome is Panicked,
 * it throws the payload again, unchanged. Otherwise it returns the `Ok` or
 * `Err` as a `Result`, now that no panic is left in it.
 *
 * The payload is thrown as is, not through a panic runtime, so an outer
 * boundary of the runtime that reported it reports it again. To pass a
 * payload on without a second report, call that runtime's `resumeUnwind`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to resume
 * @returns The Ok or Err as a Result
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { Ok, Panicked, resume } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(resume(Ok(1))), 1);
 * assertThrows(() => resume(Panicked(new RangeError("too big"))), RangeError, "too big");
 * ```
 */
export function resume<T, E, P>(self: Outcome<T, E, P>): Result<T, E> {
	return match(self)({
		Ok: (value) => ResultOk<T, E>(value),
		Err: (error) => ResultErr<T, E>(error),
		Panicked: (payload): never => {
			throw payload;
		},
	});
}
