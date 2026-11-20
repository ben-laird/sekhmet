/**
 * Transforming an either: `mapLeft`, `mapRight`, `mapEither` and `map`,
 * collapsing it with `either` or `intoInner`, and swapping its sides with
 * `flip`.
 *
 * @module
 */

import { match, union } from "@/src/core/mini/exit.ts";
import { type Either, Left, Right } from "./core.ts";

/**
 * Maps the left value of an Either, leaving a Right unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template M The type of the mapped left value
 * @param self The Either to map
 * @param mapping A function that transforms the left value
 * @returns `Left(mapping(value))` if Left, otherwise the Right unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, mapLeft } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(mapLeft(Left(2), (n) => n * 10), Left(20));
 *
 * const right: Either<number, string> = Right("a");
 * assertEquals(mapLeft(right, (n) => n * 10), Right("a"));
 * ```
 */
export function mapLeft<L, R, M>(
	self: Either<L, R>,
	mapping: (value: L) => M,
): Either<M, R> {
	return match(self)({
		Left: (value) => Left(mapping(value)),
		Right,
	});
}

/**
 * Maps the right value of an Either, leaving a Left unchanged.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The type of the mapped right value
 * @param self The Either to map
 * @param mapping A function that transforms the right value
 * @returns `Right(mapping(value))` if Right, otherwise the Left unchanged
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, mapRight } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(mapRight(Right("a"), (s) => s.length), Right(1));
 *
 * const left: Either<number, string> = Left(2);
 * assertEquals(mapRight(left, (s) => s.length), Left(2));
 * ```
 */
export function mapRight<L, R, S>(
	self: Either<L, R>,
	mapping: (value: R) => S,
): Either<L, S> {
	return match(self)({
		Left,
		Right: (value) => Right(mapping(value)),
	});
}

/**
 * Maps each side of an Either with its own function, keeping the variant.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template M The type of the mapped left value
 * @template S The type of the mapped right value
 * @param self The Either to map
 * @param handlers `onLeft` maps a left value, `onRight` a right one
 * @returns `Left(onLeft(value))` if Left, `Right(onRight(value))` if Right
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, mapEither } from "@sekhmet/enum/either/mini";
 *
 * const handlers = {
 *   onLeft: (n: number) => n * 10,
 *   onRight: (s: string) => s.length,
 * };
 * const left: Either<number, string> = Left(2);
 * const right: Either<number, string> = Right("abc");
 *
 * assertEquals(mapEither(left, handlers), Left(20));
 * assertEquals(mapEither(right, handlers), Right(3));
 * ```
 */
export function mapEither<L, R, M, S>(
	self: Either<L, R>,
	handlers: {
		readonly onLeft: (value: L) => M;
		readonly onRight: (value: R) => S;
	},
): Either<M, S> {
	return match(self)({
		Left: (value): Either<M, S> => Left(handlers.onLeft(value)),
		Right: (value): Either<M, S> => Right(handlers.onRight(value)),
	});
}

/**
 * Maps the value of an Either whose sides share a type, keeping the variant:
 * Rust's `Either<T, T>::map`.
 *
 * In main, this is a method of an `Either<T, T>` alone: TypeScript widens
 * `Either<L, R>` to `Either<L | R, L | R>`, so `mapping` must accept both
 * sides' values.
 *
 * @template T The type of the value on either side
 * @template U The type of the mapped value
 * @param self An Either whose sides share a type
 * @param mapping A function that transforms the value
 * @returns The mapped value, on the side the original was on
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, map } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, number> = Left(2);
 * const right: Either<number, number> = Right(3);
 *
 * assertEquals(map(left, (n) => n * 10), Left(20));
 * assertEquals(map(right, (n) => n * 10), Right(30));
 * ```
 */
export function map<T, U>(
	self: Either<T, T>,
	mapping: (value: T) => U,
): Either<U, U> {
	return match(self)({
		Left: (value): Either<U, U> => Left(mapping(value)),
		Right: (value): Either<U, U> => Right(mapping(value)),
	});
}

/**
 * Collapses an Either to one value by applying the function for its side.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template T The type both functions return
 * @param self The Either to collapse
 * @param handlers `onLeft` handles a left value, `onRight` a right one
 * @returns `onLeft(value)` if Left, `onRight(value)` if Right
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, either } from "@sekhmet/enum/either/mini";
 *
 * const describe = (value: Either<number, string>): string =>
 *   either(value, {
 *     onLeft: (n) => `number ${n}`,
 *     onRight: (s) => `text ${s}`,
 *   });
 *
 * assertEquals(describe(Left(1)), "number 1");
 * assertEquals(describe(Right("a")), "text a");
 * ```
 */
export function either<L, R, T>(
	self: Either<L, R>,
	handlers: {
		readonly onLeft: (value: L) => T;
		readonly onRight: (value: R) => T;
	},
): T {
	return match(self)({
		Left: handlers.onLeft,
		Right: handlers.onRight,
	});
}

/**
 * Swaps the sides of an Either: `Left(x)` becomes `Right(x)` and `Right(y)`
 * becomes `Left(y)`.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to flip
 * @returns The Either with its sides swapped
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Left, Right, flip } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(flip(Left(1)), Right(1));
 * assertEquals(flip(Right("a")), Left("a"));
 * ```
 */
export function flip<L, R>(self: Either<L, R>): Either<R, L> {
	return match(self)({
		Left: (value): Either<R, L> => Right(value),
		Right: (value): Either<R, L> => Left(value),
	});
}

/**
 * Returns the value of an Either, whichever side holds it, as a plain
 * `L | R`: the escape hatch out of `Either`.
 *
 * Rust's `into_inner` requires both sides to share a type; TypeScript has
 * unions, so this one doesn't. It forgets which side the value came from.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @returns The left or right value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, intoInner } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, string> = Left(1);
 * const right: Either<number, string> = Right("a");
 * const values: (number | string)[] = [intoInner(left), intoInner(right)];
 *
 * assertEquals(values, [1, "a"]);
 * ```
 */
export function intoInner<L, R>(self: Either<L, R>): L | R {
	return union(self);
}
