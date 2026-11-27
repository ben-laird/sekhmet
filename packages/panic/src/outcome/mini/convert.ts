/**
 * Bridging outcomes and results: `fromResult`, and the receiver-constrained
 * `intoResult` (no panic channel left) and `panicResult` (no error channel
 * left), plus `intoNested` for interop with code that nests them, and
 * `fromCaught`, which flattens a boundary's `Outcome` of a `Result`.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini/core";
import { panicWithoutCause } from "@/src/mini/core.ts";
import {
	type Outcome,
	Err as OutcomeErr,
	Ok as OutcomeOk,
	Panicked as OutcomePanicked,
} from "./core.ts";
import { resume } from "./panic.ts";

/**
 * Converts a Result to an Outcome with no panic in it: `Ok` stays `Ok` and
 * `Err` stays `Err`. Use it where work that returns a Result joins a chain of
 * Outcomes, such as in `andThen`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @param result The Result to convert
 * @returns An Outcome holding the Result's value or error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err as ResultErr } from "@sekhmet/enum/result/mini";
 * import { Err, fromResult } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(fromResult(ResultErr("not found")), Err("not found"));
 * ```
 */
export function fromResult<T, E>(result: Result<T, E>): Outcome<T, E, never> {
	return match(result)({
		Ok: (value) => OutcomeOk<T, E>(value),
		Err: (error) => OutcomeErr<T, E>(error),
	});
}

/**
 * Converts an Outcome that cannot hold a panic, such as one `recover`
 * returned, to a Result. Its type rules out a `Panicked`, so a receiver whose
 * payload type is not `never` is a type error.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @param self An Outcome whose payload type is never
 * @returns The Ok or Err as a Result
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/enum/result/mini";
 * import { Err, type Outcome, intoResult } from "@sekhmet/panic/outcome/mini";
 *
 * const handled: Outcome<number, string, never> = Err("not found");
 *
 * assertEquals(unwrapErr(intoResult(handled)), "not found");
 * ```
 */
export function intoResult<T, E>(self: Outcome<T, E, never>): Result<T, E> {
	return resume(self);
}

/**
 * Converts an Outcome that cannot hold an expected error, such as one a
 * panic boundary returned, to a Result whose error is the panic payload. Its
 * type rules out an `Err`, so a receiver whose error type is not `never` is a
 * type error.
 *
 * @template T The type of the success value
 * @template P The type of the panic payload
 * @param self An Outcome whose error type is never
 * @returns Ok of the value, or Err of the panic payload
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/enum/result/mini";
 * import { type Outcome, Panicked, panicResult } from "@sekhmet/panic/outcome/mini";
 *
 * const caught: Outcome<number, never> = Panicked("boom");
 *
 * assertEquals(unwrapErr(panicResult(caught)), "boom");
 * ```
 */
export function panicResult<T, P>(self: Outcome<T, never, P>): Result<T, P> {
	return match(self)({
		Ok: (value) => Ok<T, P>(value),
		Err: (error) => {
			return panicWithoutCause({
				name: "Outcome",
				message: `panicResult got an Err, which its type rules out: ${String(error)}`,
			});
		},
		Panicked: (payload) => Err<T, P>(payload),
	});
}

/**
 * Converts an Outcome to a Result nested in a Result, for interop with code
 * that keeps the two failure channels that way: the inner Result holds `Ok`
 * or `Err`, and the outer `Err` holds the panic payload.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to convert
 * @returns Ok of the inner Result if Ok or Err, otherwise Err of the payload
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { Err, type Outcome, Panicked, intoNested } from "@sekhmet/panic/outcome/mini";
 *
 * const failed: Outcome<number, string> = Err("not found");
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(unwrapErr(unwrap(intoNested(failed))), "not found");
 * assertEquals(unwrapErr(intoNested(bug)), "boom");
 * ```
 */
export function intoNested<T, E, P>(
	self: Outcome<T, E, P>,
): Result<Result<T, E>, P> {
	return match(self)({
		Ok: (value) => Ok<Result<T, E>, P>(Ok(value)),
		Err: (error) => Ok<Result<T, E>, P>(Err(error)),
		Panicked: (payload) => Err<Result<T, E>, P>(payload),
	});
}

/**
 * Flattens what a panic boundary caught around work that returns a Result
 * into one Outcome: `Ok(Ok(value))` becomes `Ok(value)`, `Ok(Err(error))`
 * becomes `Err(error)`, and `Panicked(payload)` stays `Panicked(payload)`.
 *
 * It is how an expected failure is classified at the edge: a boundary's
 * `catchUnwind` has no error channel of its own, so work that can fail
 * returns a Result, and this lifts that Result's error into the Outcome's.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self An Outcome of a Result whose error type is never, as a
 *   boundary returns it
 * @returns The inner Result's value or error, or the panic payload
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err as ResultErr, Ok as ResultOk } from "@sekhmet/enum/result/mini";
 * import { Err, fromCaught, Ok, Panicked } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(fromCaught(Ok(ResultOk(1))), Ok(1));
 * assertEquals(fromCaught(Ok(ResultErr("not found"))), Err("not found"));
 * assertEquals(fromCaught(Panicked("boom")), Panicked("boom"));
 * ```
 */
export function fromCaught<T, E, P>(
	self: Outcome<Result<T, E>, never, P>,
): Outcome<T, E, P> {
	return match(self)({
		Ok: (result) => {
			return match(result)({
				Ok: (value) => OutcomeOk<T, E, P>(value),
				Err: (error) => OutcomeErr<T, E, P>(error),
			});
		},
		Err: (error) => {
			return panicWithoutCause({
				name: "Outcome",
				message: `fromCaught got an Err, which its type rules out: ${String(error)}`,
			});
		},
		Panicked: (payload) => OutcomePanicked<T, E, P>(payload),
	});
}
