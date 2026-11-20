/**
 * Combining eithers: conversion to `Option` (`left`, `right`), chaining
 * (`leftAnd`, `leftAndThen` and their right forms) and factoring a shared
 * part out of both sides (`factorNone`, `factorErr`, `factorOk`,
 * `factorFirst`, `factorSecond`).
 *
 * @module
 */

import { match } from "@/src/core/mini/exit.ts";
import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import { type Either, Left, Right } from "./core.ts";

/**
 * Converts an Either to an Option of its left value.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to convert
 * @returns `Some(value)` if Left, `None` if Right
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Left, Right, left } from "@sekhmet/enum/either/mini";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(unwrap(left(Left(1))), 1);
 * assertEquals(isNone(left(Right("a"))), true);
 * ```
 */
export function left<L, R>(self: Either<L, R>): Option<L> {
	return match(self)({
		Left: (value) => Some(value),
		Right: () => None(),
	});
}

/**
 * Converts an Either to an Option of its right value.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to convert
 * @returns `Some(value)` if Right, `None` if Left
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Left, Right, right } from "@sekhmet/enum/either/mini";
 * import { isNone, unwrap } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(unwrap(right(Right("a"))), "a");
 * assertEquals(isNone(right(Left(1))), true);
 * ```
 */
export function right<L, R>(self: Either<L, R>): Option<R> {
	return match(self)({
		Left: () => None(),
		Right: (value) => Some(value),
	});
}

/**
 * Returns `other` if the Either is Left, otherwise the Right unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The type of `other`'s left value
 * @param self The Either to check
 * @param other The Either to return if `self` is Left
 * @returns `other` if Left, otherwise the Right from `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, leftAnd } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, number> = Left(1);
 * const right: Either<number, number> = Right(2);
 * const other: Either<string, number> = Left("next");
 *
 * assertEquals(leftAnd(left, other), Left("next"));
 * assertEquals(leftAnd(right, other), Right(2));
 * ```
 */
export function leftAnd<L, R, S>(
	self: Either<L, R>,
	other: Either<S, R>,
): Either<S, R> {
	return match(self)({
		Left: () => other,
		Right,
	});
}

/**
 * Chains a computation onto the left value of an Either: if Left, returns
 * `mapping(value)`, otherwise the Right unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The type of the new left value
 * @param self The Either to chain from
 * @param mapping A function that takes the left value and returns an Either
 * @returns The Either from `mapping` if Left, otherwise the Right from `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, leftAndThen } from "@sekhmet/enum/either/mini";
 *
 * const halve = (n: number): Either<number, string> =>
 *   n % 2 === 0 ? Left(n / 2) : Right(`odd: ${n}`);
 *
 * const even: Either<number, string> = Left(4);
 * const odd: Either<number, string> = Left(3);
 * const skip: Either<number, string> = Right("skip");
 *
 * assertEquals(leftAndThen(even, halve), Left(2));
 * assertEquals(leftAndThen(odd, halve), Right("odd: 3"));
 * assertEquals(leftAndThen(skip, halve), Right("skip"));
 * ```
 */
export function leftAndThen<L, R, S>(
	self: Either<L, R>,
	mapping: (value: L) => Either<S, R>,
): Either<S, R> {
	return match(self)({
		Left: mapping,
		Right,
	});
}

/**
 * Returns `other` if the Either is Right, otherwise the Left unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The type of `other`'s right value
 * @param self The Either to check
 * @param other The Either to return if `self` is Right
 * @returns `other` if Right, otherwise the Left from `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, rightAnd } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, boolean> = Left(1);
 * const right: Either<number, boolean> = Right(true);
 * const other: Either<number, string> = Right("next");
 *
 * assertEquals(rightAnd(right, other), Right("next"));
 * assertEquals(rightAnd(left, other), Left(1));
 * ```
 */
export function rightAnd<L, R, S>(
	self: Either<L, R>,
	other: Either<L, S>,
): Either<L, S> {
	return match(self)({
		Left,
		Right: () => other,
	});
}

/**
 * Chains a computation onto the right value of an Either: if Right, returns
 * `mapping(value)`, otherwise the Left unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The type of the new right value
 * @param self The Either to chain from
 * @param mapping A function that takes the right value and returns an Either
 * @returns The Either from `mapping` if Right, otherwise the Left from `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, rightAndThen } from "@sekhmet/enum/either/mini";
 *
 * const parse = (s: string): Either<string, number> =>
 *   Number.isNaN(Number(s)) ? Left(`not a number: ${s}`) : Right(Number(s));
 *
 * const digits: Either<string, string> = Right("42");
 * const letters: Either<string, string> = Right("x");
 * const skip: Either<string, string> = Left("skip");
 *
 * assertEquals(rightAndThen(digits, parse), Right(42));
 * assertEquals(rightAndThen(letters, parse), Left("not a number: x"));
 * assertEquals(rightAndThen(skip, parse), Left("skip"));
 * ```
 */
export function rightAndThen<L, R, S>(
	self: Either<L, R>,
	mapping: (value: R) => Either<L, S>,
): Either<L, S> {
	return match(self)({
		Left,
		Right: mapping,
	});
}

/**
 * Factors a shared `None` out of an Either of Options: Rust's
 * `Either<Option<L>, Option<R>>::factor_none`.
 *
 * @template L The type of the left Option's value
 * @template R The type of the right Option's value
 * @param self An Either whose sides are Options
 * @returns `Some` of the Either of the present value, or `None` if the side's Option is empty
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, factorNone } from "@sekhmet/enum/either/mini";
 * import { None, type Option, Some, isNone, unwrap } from "@sekhmet/enum/option/mini";
 *
 * const some: Either<Option<number>, Option<string>> = Left(Some(1));
 * const none: Either<Option<number>, Option<string>> = Right(None());
 *
 * assertEquals(unwrap(factorNone(some)), Left(1));
 * assertEquals(isNone(factorNone(none)), true);
 * ```
 */
export function factorNone<L, R>(
	self: Either<Option<L>, Option<R>>,
): Option<Either<L, R>> {
	return match(self)({
		Left: (option) => {
			return match(option)({
				Some: (value): Option<Either<L, R>> => Some(Left(value)),
				None: (): Option<Either<L, R>> => None(),
			});
		},
		Right: (option) => {
			return match(option)({
				Some: (value): Option<Either<L, R>> => Some(Right(value)),
				None: (): Option<Either<L, R>> => None(),
			});
		},
	});
}

/**
 * Factors a shared error out of an Either of Results: Rust's
 * `Either<Result<L, E>, Result<R, E>>::factor_err`.
 *
 * @template L The type of the left Result's success value
 * @template R The type of the right Result's success value
 * @template E The error type both Results share
 * @param self An Either whose sides are Results with one error type
 * @returns `Ok` of the Either of the success value, or the side's `Err`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, factorErr } from "@sekhmet/enum/either/mini";
 * import { Err, Ok, type Result, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 *
 * type Side = Either<Result<number, string>, Result<boolean, string>>;
 * const ok: Side = Right(Ok(true));
 * const err: Side = Left(Err("failed"));
 *
 * assertEquals(unwrap(factorErr(ok)), Right(true));
 * assertEquals(unwrapErr(factorErr(err)), "failed");
 * ```
 */
export function factorErr<L, R, E>(
	self: Either<Result<L, E>, Result<R, E>>,
): Result<Either<L, R>, E> {
	return match(self)({
		Left: (result) => {
			return match(result)({
				Ok: (value): Result<Either<L, R>, E> => Ok(Left(value)),
				Err: (err): Result<Either<L, R>, E> => Err(err),
			});
		},
		Right: (result) => {
			return match(result)({
				Ok: (value): Result<Either<L, R>, E> => Ok(Right(value)),
				Err: (err): Result<Either<L, R>, E> => Err(err),
			});
		},
	});
}

/**
 * Factors a shared success value out of an Either of Results, keeping the
 * two error sources apart: Rust's
 * `Either<Result<T, L>, Result<T, R>>::factor_ok`.
 *
 * @template T The success type both Results share
 * @template L The type of the left Result's error
 * @template R The type of the right Result's error
 * @param self An Either whose sides are Results with one success type
 * @returns The side's `Ok`, or `Err` of the Either of the error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, factorOk } from "@sekhmet/enum/either/mini";
 * import { Err, Ok, type Result, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 *
 * type Side = Either<Result<number, string>, Result<number, Error>>;
 * const ok: Side = Right(Ok(1));
 * const err: Side = Left(Err("parse"));
 *
 * assertEquals(unwrap(factorOk(ok)), 1);
 * assertEquals(unwrapErr(factorOk(err)), Left("parse"));
 * ```
 */
export function factorOk<T, L, R>(
	self: Either<Result<T, L>, Result<T, R>>,
): Result<T, Either<L, R>> {
	return match(self)({
		Left: (result) => {
			return match(result)({
				Ok: (value): Result<T, Either<L, R>> => Ok(value),
				Err: (err): Result<T, Either<L, R>> => Err(Left(err)),
			});
		},
		Right: (result) => {
			return match(result)({
				Ok: (value): Result<T, Either<L, R>> => Ok(value),
				Err: (err): Result<T, Either<L, R>> => Err(Right(err)),
			});
		},
	});
}

/**
 * Factors a shared first element out of an Either of pairs: Rust's
 * `Either<(T, L), (T, R)>::factor_first`.
 *
 * @template T The type of the first element both pairs share
 * @template L The type of the left pair's second element
 * @template R The type of the right pair's second element
 * @param self An Either whose sides are pairs with one first-element type
 * @returns The first element, and an Either of the second element on its side
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, factorFirst } from "@sekhmet/enum/either/mini";
 *
 * const value: Either<[string, number], [string, boolean]> = Left(["id", 1]);
 *
 * assertEquals(factorFirst(value), ["id", Left(1)]);
 * ```
 */
export function factorFirst<T, L, R>(
	self: Either<[first: T, second: L], [first: T, second: R]>,
): [first: T, second: Either<L, R>] {
	return match(self)({
		Left: ([first, second]): [first: T, second: Either<L, R>] => {
			return [first, Left(second)];
		},
		Right: ([first, second]): [first: T, second: Either<L, R>] => {
			return [first, Right(second)];
		},
	});
}

/**
 * Factors a shared second element out of an Either of pairs: Rust's
 * `Either<(L, T), (R, T)>::factor_second`.
 *
 * @template T The type of the second element both pairs share
 * @template L The type of the left pair's first element
 * @template R The type of the right pair's first element
 * @param self An Either whose sides are pairs with one second-element type
 * @returns An Either of the first element on its side, and the second element
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, factorSecond } from "@sekhmet/enum/either/mini";
 *
 * const value: Either<[number, string], [boolean, string]> = Right([true, "id"]);
 *
 * assertEquals(factorSecond(value), [Right(true), "id"]);
 * ```
 */
export function factorSecond<T, L, R>(
	self: Either<[first: L, second: T], [first: R, second: T]>,
): [first: Either<L, R>, second: T] {
	return match(self)({
		Left: ([first, second]): [first: Either<L, R>, second: T] => {
			return [Left(first), second];
		},
		Right: ([first, second]): [first: Either<L, R>, second: T] => {
			return [Right(first), second];
		},
	});
}
