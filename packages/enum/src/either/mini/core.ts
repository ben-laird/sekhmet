/**
 * The `Either` class and its `Left` and `Right` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Creates an `Either` holding a value on the left.
 *
 * @template L The type of the left value
 * @template R The type of the right value (defaults to never since Left never holds one)
 * @param value The value to hold on the left
 * @returns An Either in the Left variant holding the value
 *
 * @example
 * ```ts
 * import { type Either, Left } from "@sekhmet/enum/either/mini";
 *
 * const left = Left(42);
 * const widened: Either<number, string> = Left<number, string>(42);
 * ```
 */
export function Left<L = unknown, R = never>(value: L): Either<L, R> {
	return new Either<L, R>("Left", value);
}

/**
 * Creates an `Either` holding a value on the right.
 *
 * @template L The type of the left value (defaults to never since Right never holds one)
 * @template R The type of the right value
 * @param value The value to hold on the right
 * @returns An Either in the Right variant holding the value
 *
 * @example
 * ```ts
 * import { type Either, Right } from "@sekhmet/enum/either/mini";
 *
 * const right = Right("text");
 * const widened: Either<number, string> = Right<number, string>("text");
 * ```
 */
export function Right<L = never, R = unknown>(value: R): Either<L, R> {
	return new Either<L, R>("Right", value);
}

/**
 * The variant structure of an Either: `Left` holds an `L`, `Right` an `R`.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 */
type Variants<L, R> = Split<{ Left: [value: L]; Right: [value: R] }>;

/**
 * The variant structure of an Either, for advanced type manipulations.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 */
export type { Variants as EitherVariants };

/**
 * A value of one of two types: `Left(L)` or `Right(R)`.
 *
 * Unlike `Result`, neither side is the error: `Either` keeps two sources of a
 * value apart, at runtime as well as in the type, where a plain `L | R` loses
 * which side a value came from (and can't tell them apart at all when `L` and
 * `R` overlap). Ported from Rust's
 * [`either`](https://docs.rs/either) crate.
 *
 * Not ported, because they rest on Rust traits or ownership with no
 * TypeScript equivalent:
 *
 * - `left_or_default`/`right_or_default`: `Default` (pass the fallback to
 *   `leftOr`/`rightOr`).
 * - `either_into`: `Into` (use `either` with the conversions).
 * - `as_ref`, `as_mut`, `as_pin_ref`, `as_pin_mut`, `as_deref`,
 *   `as_deref_mut`, `cloned` and `copied`: borrowing, pinning and copying;
 *   JavaScript values are already shared references.
 * - `either_with`/`map_either_with`: threading one owned context into
 *   either closure; a JavaScript closure captures it.
 * - `into_iter`, `iter`, `iter_mut` and the `factor_*iter*` family, and the
 *   `Iterator`, `Extend` and `FromIterator` impls: they need both sides to
 *   implement `IntoIterator`.
 * - The `Deref`, `AsRef`, `Read`, `BufRead`, `Write`, `Seek`, `Future`,
 *   `Error` and `Display` impls, which forward a trait to whichever side is
 *   present.
 *
 * @template L The type of the left value
 * @template R The type of the right value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { type Either, Left, Right } from "@sekhmet/enum/either/mini";
 *
 * const lookup = (key: string): Either<number, string> =>
 *   key === "port" ? Left(8080) : Right(`unknown key: ${key}`);
 *
 * const describe = (value: Either<number, string>): string =>
 *   match(value)({
 *     Left: (n) => `number ${n}`,
 *     Right: (s) => `text ${s}`,
 *   });
 *
 * assertEquals(describe(lookup("port")), "number 8080");
 * assertEquals(describe(lookup("host")), "text unknown key: host");
 * ```
 */
export class Either<out L, out R> extends Enum<Variants<L, R>> {}
