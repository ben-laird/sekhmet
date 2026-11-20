/**
 * Getting a side's value out of an either: `unwrapLeft`/`expectLeft` (and
 * their right forms) panic on the other side; `leftOr`, `leftOrElse`,
 * `rightOr` and `rightOrElse` take a fallback.
 *
 * @module
 */

import { match, union } from "@/src/core/mini/exit.ts";
import { assertIsolated } from "@/src/core/mini/isolate.ts";
import type { Either } from "./core.ts";

/**
 * Returns the left value, or a fallback if the Either is Right.
 *
 * @template L The type of the left value and the fallback
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @param fallback The value to return if the Either is Right
 * @returns The left value if Left, otherwise `fallback`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, leftOr } from "@sekhmet/enum/either/mini";
 *
 * const right: Either<number, string> = Right("a");
 *
 * assertEquals(leftOr(Left(1), 0), 1);
 * assertEquals(leftOr(right, 0), 0);
 * ```
 */
export function leftOr<L, R>(self: Either<L, R>, fallback: L): L {
	return match(self)({
		Left: (value) => value,
		Right: () => fallback,
	});
}

/**
 * Returns the left value, or computes one from the right value.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @param fallback A function that turns the right value into a left one
 * @returns The left value if Left, otherwise `fallback(value)`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, leftOrElse } from "@sekhmet/enum/either/mini";
 *
 * const right: Either<number, string> = Right("abc");
 *
 * assertEquals(leftOrElse(Left(1), (s: string) => s.length), 1);
 * assertEquals(leftOrElse(right, (s) => s.length), 3);
 * ```
 */
export function leftOrElse<L, R>(
	self: Either<L, R>,
	fallback: (value: R) => L,
): L {
	return match(self)({
		Left: (value) => value,
		Right: fallback,
	});
}

/**
 * Returns the right value, or a fallback if the Either is Left.
 *
 * @template L The type of the left value
 * @template R The type of the right value and the fallback
 * @param self The Either to unwrap
 * @param fallback The value to return if the Either is Left
 * @returns The right value if Right, otherwise `fallback`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, rightOr } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, string> = Left(1);
 *
 * assertEquals(rightOr(Right("a"), "none"), "a");
 * assertEquals(rightOr(left, "none"), "none");
 * ```
 */
export function rightOr<L, R>(self: Either<L, R>, fallback: R): R {
	return match(self)({
		Left: () => fallback,
		Right: (value) => value,
	});
}

/**
 * Returns the right value, or computes one from the left value.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @param fallback A function that turns the left value into a right one
 * @returns The right value if Right, otherwise `fallback(value)`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, rightOrElse } from "@sekhmet/enum/either/mini";
 *
 * const left: Either<number, string> = Left(42);
 *
 * assertEquals(rightOrElse(Right("a"), (n: number) => String(n)), "a");
 * assertEquals(rightOrElse(left, (n) => String(n)), "42");
 * ```
 */
export function rightOrElse<L, R>(
	self: Either<L, R>,
	fallback: (value: L) => R,
): R {
	return match(self)({
		Left: fallback,
		Right: (value) => value,
	});
}

/**
 * Returns the left value, or panics with a custom message if Right.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @param message The panic message if the Either is Right
 * @returns The left value
 * @throws Error with the provided message if the Either is Right
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Left, Right, expectLeft } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(expectLeft(Left(1), "should be left"), 1);
 * assertThrows(() => expectLeft(Right("a"), "should be left"), Error, "should be left");
 * ```
 */
export function expectLeft<L, R>(self: Either<L, R>, message: string): L {
	assertIsolated(self, "Left", message);

	return union(self);
}

/**
 * Returns the left value, or panics if Right.
 *
 * Prefer `expectLeft` when you know why the Either should be Left.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @returns The left value
 * @throws Error if the Either is Right
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Left, Right, unwrapLeft } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(unwrapLeft(Left(1)), 1);
 * assertThrows(() => unwrapLeft(Right("a")), Error, "Either unwrapLeft failed!");
 * ```
 */
export function unwrapLeft<L, R>(self: Either<L, R>): L {
	return expectLeft(self, "Either unwrapLeft failed!");
}

/**
 * Returns the right value, or panics with a custom message if Left.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @param message The panic message if the Either is Left
 * @returns The right value
 * @throws Error with the provided message if the Either is Left
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Left, Right, expectRight } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(expectRight(Right("a"), "should be right"), "a");
 * assertThrows(() => expectRight(Left(1), "should be right"), Error, "should be right");
 * ```
 */
export function expectRight<L, R>(self: Either<L, R>, message: string): R {
	assertIsolated(self, "Right", message);

	return union(self);
}

/**
 * Returns the right value, or panics if Left.
 *
 * Prefer `expectRight` when you know why the Either should be Right.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to unwrap
 * @returns The right value
 * @throws Error if the Either is Left
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Left, Right, unwrapRight } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(unwrapRight(Right("a")), "a");
 * assertThrows(() => unwrapRight(Left(1)), Error, "Either unwrapRight failed!");
 * ```
 */
export function unwrapRight<L, R>(self: Either<L, R>): R {
	return expectRight(self, "Either unwrapRight failed!");
}
