/**
 * Combining outcomes: `and`/`or` and their lazy forms, conversion to
 * `Option` (`ok`, `err`), iteration, `transpose`, and flattening a nested
 * value (`flatten`, `flattenResult`, `flattenEither`). Each passes a
 * `Panicked` through untouched; `ok`, `err` and `iter`, which return no
 * Outcome, resume it.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import type { Either } from "@sekhmet/enum/either/mini/core";
import { Left, Right } from "@sekhmet/enum/either/mini/core";
import { None, type Option, Some } from "@sekhmet/enum/option/mini/core";
import {
	err as resultErr,
	iter as resultIter,
	ok as resultOk,
} from "@sekhmet/enum/result/mini/combinators";
import type { Result } from "@sekhmet/enum/result/mini/core";
import { Err, Ok, type Outcome, Panicked } from "./core.ts";
import { resume } from "./panic.ts";

/**
 * Converts an Outcome to an Option of its success value: `Ok(value)` becomes
 * `Some(value)` and `Err` becomes `None`. A `Panicked` is resumed: its
 * payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to convert
 * @returns Some holding the value if Ok, None if Err
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { Err, Ok, ok } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(ok(Ok(42))), 42);
 * assertEquals(isNone(ok(Err("failed"))), true);
 * ```
 */
export function ok<T, E, P>(self: Outcome<T, E, P>): Option<T> {
	return resultOk(resume(self));
}

/**
 * Converts an Outcome to an Option of its expected error: `Err(error)`
 * becomes `Some(error)` and `Ok` becomes `None`. A `Panicked` is resumed:
 * its payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to convert
 * @returns Some holding the error if Err, None if Ok
 * @throws The panic payload, unchanged, if the Outcome is Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 * import { Err, Ok, err } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(err(Err("failed"))), "failed");
 * assertEquals(isNone(err(Ok(42))), true);
 * ```
 */
export function err<T, E, P>(self: Outcome<T, E, P>): Option<E> {
	return resultErr(resume(self));
}

/**
 * Returns an iterator over the success value: it yields the value once if
 * Ok, and nothing if Err. A `Panicked` is resumed when iteration starts: its
 * payload is thrown again.
 *
 * @template T The type of the success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self The Outcome to iterate over
 * @returns A generator that yields the success value if Ok, or nothing if Err
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, iter } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(Array.from(iter(Ok(42))), [42]);
 * assertEquals(Array.from(iter(Err("failed"))), []);
 * ```
 */
export function* iter<T, E, P>(
	self: Outcome<T, E, P>,
): Generator<T, void, undefined> {
	yield* resultIter(resume(self));
}

/**
 * Returns `other` if this Outcome is Ok; an `Err` or `Panicked` passes
 * through unchanged.
 *
 * @template T The type of the first success value
 * @template E The type of the error, shared by both Outcomes
 * @template P The type of the panic payload, shared by both Outcomes
 * @template U The type of the second success value
 * @param self The first Outcome
 * @param other The Outcome to return if `self` is Ok
 * @returns `other` if `self` is Ok, otherwise `self`'s Err or Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, and } from "@sekhmet/panic/outcome/mini";
 *
 * const first: Outcome<number, string> = Ok(1);
 * const failed: Outcome<number, string> = Err("first");
 * const bug: Outcome<number, string> = Panicked("boom");
 * const second: Outcome<string, string> = Ok("b");
 *
 * assertEquals(and(first, second), Ok("b"));
 * assertEquals(and(failed, second), Err("first"));
 * assertEquals(and(bug, second), Panicked("boom"));
 * ```
 */
export function and<T, E, P, U>(
	self: Outcome<T, E, P>,
	other: Outcome<U, E, P>,
): Outcome<U, E, P> {
	return andThen(self, () => other);
}

/**
 * Chains work that yields an Outcome onto an Ok value; an `Err` or
 * `Panicked` passes through unchanged.
 *
 * @template T The type of the original success value
 * @template E The type of the error
 * @template P The type of the panic payload
 * @template U The type of the new success value
 * @param self The Outcome to chain from
 * @param next A function that takes the success value and returns an Outcome
 * @returns The Outcome `next` returns if Ok, otherwise `self`'s Err or Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, andThen } from "@sekhmet/panic/outcome/mini";
 *
 * const half = (n: number): Outcome<number, string> => {
 *   return n % 2 === 0 ? Ok(n / 2) : Err(`odd: ${n}`);
 * };
 * const even: Outcome<number, string> = Ok(8);
 * const odd: Outcome<number, string> = Ok(3);
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(andThen(even, half), Ok(4));
 * assertEquals(andThen(odd, half), Err("odd: 3"));
 * assertEquals(andThen(bug, half), Panicked("boom"));
 * ```
 */
export function andThen<T, E, P, U>(
	self: Outcome<T, E, P>,
	next: (value: T) => Outcome<U, E, P>,
): Outcome<U, E, P> {
	return match(self)({
		Ok: next,
		Err: (error) => Err<U, E, P>(error),
		Panicked: (payload) => Panicked<U, E, P>(payload),
	});
}

/**
 * Returns `other` if this Outcome is Err; an `Ok` or `Panicked` passes
 * through unchanged. A fallback for an expected error never replaces a
 * panic.
 *
 * @template T The type of the success value, shared by both Outcomes
 * @template E The type of the original error
 * @template P The type of the panic payload, shared by both Outcomes
 * @template F The type of the fallback's error
 * @param self The first Outcome
 * @param other The Outcome to return if `self` is Err
 * @returns `other` if `self` is Err, otherwise `self`'s Ok or Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, or } from "@sekhmet/panic/outcome/mini";
 *
 * const first: Outcome<number, string> = Ok(1);
 * const failed: Outcome<number, string> = Err("first");
 * const bug: Outcome<number, string> = Panicked("boom");
 * const fallback: Outcome<number, string> = Ok(2);
 *
 * assertEquals(or(first, fallback), Ok(1));
 * assertEquals(or(failed, fallback), Ok(2));
 * assertEquals(or(bug, fallback), Panicked("boom"));
 * ```
 */
export function or<T, E, P, F>(
	self: Outcome<T, E, P>,
	other: Outcome<T, F, P>,
): Outcome<T, F, P> {
	return orElse(self, () => other);
}

/**
 * Chains a recovery from an expected error; an `Ok` or `Panicked` passes
 * through unchanged. To recover from a panic, use `recover`.
 *
 * @template T The type of the success value
 * @template E The type of the original error
 * @template P The type of the panic payload
 * @template F The type of the new error
 * @param self The Outcome to recover
 * @param next A function that takes the error and returns an Outcome
 * @returns The Outcome `next` returns if Err, otherwise `self`'s Ok or Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Outcome, Panicked, orElse } from "@sekhmet/panic/outcome/mini";
 *
 * const retry = (error: string): Outcome<number, string> => {
 *   return error === "timeout" ? Ok(0) : Err(error);
 * };
 * const timedOut: Outcome<number, string> = Err("timeout");
 * const bug: Outcome<number, string> = Panicked("boom");
 *
 * assertEquals(orElse(timedOut, retry), Ok(0));
 * assertEquals(orElse(bug, retry), Panicked("boom"));
 * ```
 */
export function orElse<T, E, P, F>(
	self: Outcome<T, E, P>,
	next: (error: E) => Outcome<T, F, P>,
): Outcome<T, F, P> {
	return match(self)({
		Ok: (value) => Ok<T, F, P>(value),
		Err: next,
		Panicked: (payload) => Panicked<T, F, P>(payload),
	});
}

/**
 * Transposes an Outcome of an Option into an Option of an Outcome:
 * `Ok(None)` becomes `None`, `Ok(Some(x))` becomes `Some(Ok(x))`, and an
 * `Err` or `Panicked` becomes `Some` of itself.
 *
 * @template T The type of the success value inside the Option
 * @template E The type of the error
 * @template P The type of the panic payload
 * @param self An Outcome holding an Option
 * @returns An Option holding an Outcome
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, isNone, unwrap as unwrapOption } from "@sekhmet/enum/option/mini";
 * import { Ok, Panicked, isPanicked, transpose, unwrap } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(unwrap(unwrapOption(transpose(Ok(Some(5))))), 5);
 * assertEquals(isNone(transpose(Ok(None()))), true);
 * assertEquals(isPanicked(unwrapOption(transpose(Panicked("boom")))), true);
 * ```
 */
export function transpose<T, E, P>(
	self: Outcome<Option<T>, E, P>,
): Option<Outcome<T, E, P>> {
	return match(self)({
		Ok: (option) => {
			return match(option)({
				Some: (value) => Some(Ok<T, E, P>(value)),
				None: () => None<Outcome<T, E, P>>(),
			});
		},
		Err: (error) => Some(Err<T, E, P>(error)),
		Panicked: (payload) => Some(Panicked<T, E, P>(payload)),
	});
}

/**
 * Flattens an Outcome of an Outcome whose layers share their error and
 * payload types, following `Result`'s `flatten`: `Ok(inner)` becomes
 * `inner`, and an outer `Err` or `Panicked` passes through. To keep the
 * layers' failures apart, use `flattenEither`.
 *
 * @template T The type of the inner success value
 * @template E The type of the error, shared by both layers
 * @template P The type of the panic payload, shared by both layers
 * @param self An Outcome holding another Outcome
 * @returns The inner Outcome if Ok, otherwise the outer Err or Panicked
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, Panicked, flatten } from "@sekhmet/panic/outcome/mini";
 *
 * assertEquals(flatten(Ok(Ok(6))), Ok(6));
 * assertEquals(flatten(Ok(Panicked("inner"))), Panicked("inner"));
 * assertEquals(flatten(Err("outer")), Err("outer"));
 * ```
 */
export function flatten<T, E, P>(
	self: Outcome<Outcome<T, E, P>, E, P>,
): Outcome<T, E, P> {
	return andThen(self, (inner) => inner);
}

/**
 * Flattens an Outcome of a Result, keeping the two error sources apart: the
 * Result's error becomes `Left` and the Outcome's own error `Right`, at
 * runtime as well as in the type. The `Panicked` channel passes through.
 * Call `intoInner` on the `Either` for a plain `E | F`.
 *
 * @template T The type of the success value
 * @template E The type of the Result's error
 * @template F The type of the Outcome's error
 * @template P The type of the panic payload
 * @param self An Outcome holding a Result
 * @returns An Outcome whose error says which layer it came from
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { intoInner, isLeft } from "@sekhmet/enum/either/mini";
 * import { Err as ResultErr, type Result } from "@sekhmet/enum/result/mini";
 * import { Err, Ok, type Outcome, flattenResult, unwrapErr } from "@sekhmet/panic/outcome/mini";
 *
 * const returned: Outcome<Result<number, string>, string> = Ok(ResultErr("returned"));
 * const outer: Outcome<Result<number, string>, string> = Err("outer");
 * const error = unwrapErr(flattenResult(returned));
 *
 * assertEquals(isLeft(error), true);
 * assertEquals(intoInner(error), "returned");
 * assertEquals(isLeft(unwrapErr(flattenResult(outer))), false);
 * ```
 */
export function flattenResult<T, E, F, P>(
	self: Outcome<Result<T, E>, F, P>,
): Outcome<T, Either<E, F>, P> {
	return match(self)({
		Ok: (result) => {
			return match(result)({
				Ok: (value) => Ok<T, Either<E, F>, P>(value),
				Err: (error) => Err<T, Either<E, F>, P>(Left(error)),
			});
		},
		Err: (error) => Err<T, Either<E, F>, P>(Right(error)),
		Panicked: (payload) => Panicked<T, Either<E, F>, P>(payload),
	});
}

/**
 * Flattens an Outcome of an Outcome, keeping each channel's two sources
 * apart: the inner layer's error and payload become `Left`, the outer
 * layer's `Right`. Use `flatten` when the layers share their types and need
 * no telling apart.
 *
 * @template T The type of the inner success value
 * @template E The type of the inner error
 * @template P The type of the inner panic payload
 * @template F The type of the outer error
 * @template Q The type of the outer panic payload
 * @param self An Outcome holding another Outcome
 * @returns An Outcome whose error and payload each say which layer they came from
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { intoInner, isLeft } from "@sekhmet/enum/either/mini";
 * import { Ok, type Outcome, Panicked, flattenEither, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
 *
 * const inner: Outcome<Outcome<number, string>, string> = Ok(Panicked("inner bug"));
 * const outer: Outcome<Outcome<number, string>, string> = Panicked("outer bug");
 *
 * assertEquals(isLeft(unwrapPanicked(flattenEither(inner))), true);
 * assertEquals(intoInner(unwrapPanicked(flattenEither(outer))), "outer bug");
 * ```
 */
export function flattenEither<T, E, P, F, Q>(
	self: Outcome<Outcome<T, E, P>, F, Q>,
): Outcome<T, Either<E, F>, Either<P, Q>> {
	type Flat = Outcome<T, Either<E, F>, Either<P, Q>>;

	return match(self)({
		Ok: (inner): Flat => {
			return match(inner)({
				Ok: (value): Flat => Ok(value),
				Err: (error): Flat => Err(Left(error)),
				Panicked: (payload): Flat => Panicked(Left(payload)),
			});
		},
		Err: (error): Flat => Err(Right(error)),
		Panicked: (payload): Flat => Panicked(Right(payload)),
	});
}
