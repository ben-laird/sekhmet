/**
 * The `Outcome` class and its `Ok`, `Err` and `Panicked` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";

/**
 * Creates a successful `Outcome` holding a value.
 *
 * @template T The type of the success value
 * @template E The type of the error (defaults to never since Ok never holds one)
 * @template P The type of the panic payload (defaults to never since Ok never holds one)
 * @param value The success value to hold
 * @returns An Outcome in the Ok variant holding the value
 *
 * @example
 * ```ts
 * import { Ok, type Outcome } from "@sekhmet/panic/outcome/mini";
 *
 * const success = Ok(42);
 * const widened: Outcome<number, string> = Ok<number, string>(42);
 * ```
 */
export function Ok<T = unknown, E = never, P = never>(
	value: T,
): Outcome<T, E, P> {
	return new Outcome<T, E, P>("Ok", value);
}

/**
 * Creates a failed `Outcome` holding an expected error: one the work
 * returned, not one it threw.
 *
 * @template T The type of the success value (defaults to never since Err never holds one)
 * @template E The type of the error
 * @template P The type of the panic payload (defaults to never since Err never holds one)
 * @param error The error to hold
 * @returns An Outcome in the Err variant holding the error
 *
 * @example
 * ```ts
 * import { Err, type Outcome } from "@sekhmet/panic/outcome/mini";
 *
 * const failure = Err("not found");
 * const widened: Outcome<number, string> = Err<number, string>("not found");
 * ```
 */
export function Err<T = never, E = unknown, P = never>(
	error: E,
): Outcome<T, E, P> {
	return new Outcome<T, E, P>("Err", error);
}

/**
 * Creates an `Outcome` holding a panic: the payload a panic boundary caught
 * when the work threw.
 *
 * @template T The type of the success value (defaults to never since Panicked never holds one)
 * @template E The type of the error (defaults to never since Panicked never holds one)
 * @template P The type of the panic payload
 * @param payload The thrown value, unchanged
 * @returns An Outcome in the Panicked variant holding the payload
 *
 * @example
 * ```ts
 * import { type Outcome, Panicked } from "@sekhmet/panic/outcome/mini";
 *
 * const bug = Panicked(new TypeError("x is undefined"));
 * const widened: Outcome<number, string> = Panicked<number, string>("thrown");
 * ```
 */
export function Panicked<T = never, E = never, P = unknown>(
	payload: P,
): Outcome<T, E, P> {
	return new Outcome<T, E, P>("Panicked", payload);
}

/**
 * The variant structure of an Outcome: `Ok` holds a `T`, `Err` an `E` and
 * `Panicked` a `P`.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 */
type Variants<T, E, P> = Split<{
	Ok: [value: T];
	Err: [error: E];
	Panicked: [payload: P];
}>;

/**
 * The variant structure of an Outcome, for advanced type manipulations.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 */
export type { Variants as OutcomeVariants };

/**
 * What came of running work inside a panic boundary: `Ok(T)`, an expected
 * `Err(E)` the work returned, or `Panicked(P)`, the payload it threw.
 *
 * The rule: user code returns a `Result`, and a panic boundary returns an
 * `Outcome`. Holding an `Outcome` tells you a boundary was crossed, and its
 * two failure channels stay apart: the ordinary combinators (`map`, `mapErr`,
 * `andThen`, `orElse`, `unwrapOr`, …) pass a `Panicked` through untouched, so
 * handling an expected error can never swallow a bug. Where a combinator has
 * no `Outcome` to pass it through in (`unwrapOr` returns a `T`), it resumes
 * the panic: it throws the payload again. Only the panic-channel functions see
 * a panic: `isPanicked`, `isPanicAnd`, `mapPanic`, `inspectPanic`,
 * `panicked`, `recover` and `resume`.
 *
 * `P` is the raw thrown payload, `unknown` by default: JavaScript can throw
 * anything, not only a `Panic`. Narrow it with `isPanicAnd`.
 *
 * Prior art: Effect's `Exit` (`Fail` versus `Die`), ZIO's `Exit`, and Rust's
 * `JoinHandle::join`, which returns `thread::Result<Result<T, E>>`.
 *
 * @template T The type of the success value
 * @template E The type of the expected error
 * @template P The type of the panic payload
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Err, Ok, type Outcome, Panicked } from "@sekhmet/panic/outcome/mini";
 *
 * const describe = (outcome: Outcome<number, string>): string => {
 *   return match(outcome)({
 *     Ok: (value) => `got ${value}`,
 *     Err: (error) => `failed: ${error}`,
 *     Panicked: (payload) => `bug: ${String(payload)}`,
 *   });
 * };
 *
 * assertEquals(describe(Ok(1)), "got 1");
 * assertEquals(describe(Err("not found")), "failed: not found");
 * assertEquals(describe(Panicked("boom")), "bug: boom");
 * ```
 */
export class Outcome<out T, out E, out P = unknown> extends Enum<
	Variants<T, E, P>
> {}
