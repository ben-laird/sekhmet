/**
 * Testing an either: `isLeft`, `isLeftAnd`, `isLeftOr` and their right forms.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { match } from "@/src/core/mini/exit.ts";
import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Either, EitherVariants } from "./core.ts";

/**
 * Checks if an Either is in the Left variant.
 *
 * Narrows both the variant and the type parameters: the Either becomes its
 * Left variant, so its value can be read directly, and an `Either<L, never>`,
 * which fits an Either with any right type.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to check
 * @returns true if the Either is Left, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { type Either, Left, Right, isLeft } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(isLeft(Left(1)), true);
 * assertEquals(isLeft(Right("a")), false);
 *
 * const value: Either<number, string> = Left(1);
 * if (isLeft(value)) {
 *   const n: number = union(value); // the variant: value is Left
 *   const other: Either<number, boolean> = value; // an Either<number, never>
 *   assertEquals(n, 1);
 *   assertEquals(other, value);
 * }
 * ```
 */
export function isLeft<L, R>(
	self: Either<L, R>,
): self is Enum<Isolate<EitherVariants<L, R>, "Left">> & Either<L, never> {
	return isolate(self, "Left");
}

/**
 * Checks if an Either is Left and its value satisfies a predicate.
 *
 * A type guard that narrows both the variant and the type parameters: the
 * Either becomes its Left variant and an `Either<M, never>`, where `M` is the
 * type a type-guard predicate guards (or `L` for a boolean predicate).
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template M The narrowed left type when the predicate is a type guard
 * @param self The Either to check
 * @param predicate A function that tests the left value (may be a type guard)
 * @returns true if the Either is Left and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { type Either, Left, isLeftAnd } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(isLeftAnd(Left(42), (n) => n > 40), true);
 * assertEquals(isLeftAnd(Left(7), (n) => n > 40), false);
 *
 * const value: Either<unknown, number> = Left("hello");
 * if (isLeftAnd(value, (v): v is string => typeof v === "string")) {
 *   // the variant: value is Left holding a string, so no Right arm is needed
 *   const shout = match(value)({ Left: (v) => v.toUpperCase() });
 *   // the type parameters: value is an Either<string, never>
 *   const narrowed: Either<string, boolean> = value;
 *   assertEquals(shout, "HELLO");
 *   assertEquals(narrowed, value);
 * }
 * ```
 */
export function isLeftAnd<L, R, M extends L>(
	self: Either<L, R>,
	predicate: ((value: L) => value is M) | ((value: L) => boolean),
): self is Enum<Isolate<EitherVariants<M, R>, "Left">> & Either<M, never> {
	return isolateAnd(self, "Left", predicate);
}

/**
 * Checks if an Either is Left, or Right with a value satisfying a predicate.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to check
 * @param predicate A function that tests the right value
 * @returns true if the Either is Left, or Right and the predicate returns true
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, isLeftOr } from "@sekhmet/enum/either/mini";
 *
 * const short = (s: string): boolean => s.length < 3;
 * const left: Either<number, string> = Left(1);
 *
 * assertEquals(isLeftOr(left, short), true);
 * assertEquals(isLeftOr(Right("ab"), short), true);
 * assertEquals(isLeftOr(Right("abc"), short), false);
 * ```
 */
export function isLeftOr<L, R>(
	self: Either<L, R>,
	predicate: (value: R) => boolean,
): boolean {
	return match(self)({
		Left: () => true,
		Right: predicate,
	});
}

/**
 * Checks if an Either is in the Right variant.
 *
 * Narrows both the variant and the type parameters: the Either becomes its
 * Right variant, so its value can be read directly, and an
 * `Either<never, R>`, which fits an Either with any left type.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to check
 * @returns true if the Either is Right, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { type Either, Left, Right, isRight } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(isRight(Right("a")), true);
 * assertEquals(isRight(Left(1)), false);
 *
 * const value: Either<number, string> = Right("a");
 * if (isRight(value)) {
 *   const s: string = union(value); // the variant: value is Right
 *   const other: Either<boolean, string> = value; // an Either<never, string>
 *   assertEquals(s, "a");
 *   assertEquals(other, value);
 * }
 * ```
 */
export function isRight<L, R>(
	self: Either<L, R>,
): self is Enum<Isolate<EitherVariants<L, R>, "Right">> & Either<never, R> {
	return isolate(self, "Right");
}

/**
 * Checks if an Either is Right and its value satisfies a predicate.
 *
 * A type guard that narrows both the variant and the type parameters: the
 * Either becomes its Right variant and an `Either<never, S>`, where `S` is
 * the type a type-guard predicate guards (or `R` for a boolean predicate).
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @template S The narrowed right type when the predicate is a type guard
 * @param self The Either to check
 * @param predicate A function that tests the right value (may be a type guard)
 * @returns true if the Either is Right and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { type Either, Right, isRightAnd } from "@sekhmet/enum/either/mini";
 *
 * assertEquals(isRightAnd(Right("abc"), (s) => s.length === 3), true);
 *
 * type Timeout = { ms: number };
 * const value: Either<number, Error | Timeout> = Right({ ms: 500 });
 * if (isRightAnd(value, (e): e is Timeout => "ms" in e)) {
 *   // the variant: value is Right holding a Timeout, so no Left arm is needed
 *   const ms = match(value)({ Right: (e) => e.ms });
 *   // the type parameters: value is an Either<never, Timeout>
 *   const narrowed: Either<string, Timeout> = value;
 *   assertEquals(ms, 500);
 *   assertEquals(narrowed, value);
 * }
 * ```
 */
export function isRightAnd<L, R, S extends R>(
	self: Either<L, R>,
	predicate: ((value: R) => value is S) | ((value: R) => boolean),
): self is Enum<Isolate<EitherVariants<L, S>, "Right">> & Either<never, S> {
	return isolateAnd(self, "Right", predicate);
}

/**
 * Checks if an Either is Right, or Left with a value satisfying a predicate.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 * @param self The Either to check
 * @param predicate A function that tests the left value
 * @returns true if the Either is Right, or Left and the predicate returns true
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Either, Left, Right, isRightOr } from "@sekhmet/enum/either/mini";
 *
 * const positive = (n: number): boolean => n > 0;
 * const right: Either<number, string> = Right("a");
 *
 * assertEquals(isRightOr(right, positive), true);
 * assertEquals(isRightOr(Left(1), positive), true);
 * assertEquals(isRightOr(Left(-1), positive), false);
 * ```
 */
export function isRightOr<L, R>(
	self: Either<L, R>,
	predicate: (value: L) => boolean,
): boolean {
	return match(self)({
		Left: predicate,
		Right: () => true,
	});
}
