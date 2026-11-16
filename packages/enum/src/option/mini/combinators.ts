import { match, union } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import { None, type Option, Some } from "./core.ts";
import { map, mapOr } from "./transform.ts";
import { unwrapOr } from "./unwrap.ts";

/**
 * Creates an iterator that yields the value if the Option is Some.
 *
 * If the Option is None, the iterator yields nothing.
 *
 * @param self - The Option to iterate over
 * @yields The contained value if the Option is Some
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, iter } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(Array.from(iter(Some(42))), [42]);
 * assertEquals(Array.from(iter(None())), []);
 * ```
 */
export function* iter<T>(self: Option<T>): Generator<T, void, undefined> {
	const variant = self;

	if (isolate(variant, "Some")) {
		yield union(variant);
	}
}

/**
 * Returns None if self is None, otherwise returns optionB.
 *
 * This is a logical AND operation on Options. The result is Some only if both
 * Options are Some, and the value comes from the second Option.
 *
 * @param self - The first Option to check
 * @param optionB - The Option to return if self is Some
 * @returns optionB if self is Some, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, and } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(and(Some(2), Some("foo")), Some("foo"));
 * assertEquals(and(None(), Some("foo")), None());
 * assertEquals(and(Some(2), None()), None());
 * assertEquals(and(None(), None()), None());
 * ```
 */
export function and<T, U>(self: Option<T>, optionB: Option<U>): Option<U> {
	return match(self)({
		Some: () => optionB,
		None,
	});
}

/**
 * Returns None if self is None, otherwise calls optionB with the wrapped value and returns the result.
 *
 * This is commonly called "flatMap" in other languages. It allows chaining operations
 * that return Options without creating nested Options.
 *
 * @param self - The Option to check
 * @param optionB - Function that takes the value from self and returns a new Option
 * @returns The result of calling optionB if self is Some, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, type Option, Some, andThen } from "@sekhmet/enum/option/mini";
 *
 * const divideBy = (divisor: number) => (x: number): Option<number> =>
 *   divisor === 0 ? None() : Some(x / divisor);
 *
 * assertEquals(andThen(Some(4), divideBy(2)), Some(2));
 * assertEquals(andThen(Some(4), divideBy(0)), None()); // division by zero
 * assertEquals(andThen(None<number>(), divideBy(2)), None());
 * ```
 */
export function andThen<T, U>(
	self: Option<T>,
	optionB: (value: T) => Option<U>,
): Option<U> {
	return match(self)({
		Some: optionB,
		None,
	});
}

/**
 * Returns None if the Option is None, otherwise calls predicate with the wrapped value
 * and returns None if the predicate returns false, or Some if it returns true.
 *
 * Supports both type guards and regular boolean predicates.
 *
 * @param self - The Option to filter
 * @param predicate - Function that tests the value, can be a type guard or boolean predicate
 * @returns Some(value) if the predicate passes, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, filter } from "@sekhmet/enum/option/mini";
 *
 * const isEven = (n: number) => n % 2 === 0;
 *
 * assertEquals(filter(Some(4), isEven), Some(4));
 * assertEquals(filter(Some(3), isEven), None());
 * assertEquals(filter(None<number>(), isEven), None());
 * ```
 */
export function filter<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): Option<U> {
	return match(self)({
		Some(value): Option<U> {
			const p = predicate as (value: T) => value is U;

			if (!p(value)) return None();

			return Some(value);
		},
		None,
	});
}

/**
 * Returns self if it is Some, otherwise returns optionB.
 *
 * This is a logical OR operation on Options. Returns the first Some value encountered,
 * or None if both are None.
 *
 * @param self - The first Option to check
 * @param optionB - The Option to return if self is None
 * @returns self if it is Some, otherwise optionB
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, or } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(or(Some(2), Some(100)), Some(2));
 * assertEquals(or(None<number>(), Some(100)), Some(100));
 * assertEquals(or(Some(2), None()), Some(2));
 * assertEquals(or(None(), None()), None());
 * ```
 */
export function or<T>(self: Option<T>, optionB: Option<T>): Option<T> {
	return match(self)({
		Some,
		None: () => optionB,
	});
}

/**
 * Returns self if it is Some, otherwise calls optionB and returns the result.
 *
 * Lazily evaluates the alternative Option, computing it only if needed.
 *
 * @param self - The first Option to check
 * @param optionB - Function that returns an Option if self is None
 * @returns self if it is Some, otherwise the result of calling optionB
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, orElse } from "@sekhmet/enum/option/mini";
 *
 * let calls = 0;
 * const fallback = () => {
 *   calls++;
 *   return Some(100);
 * };
 *
 * assertEquals(orElse(Some(2), fallback), Some(2)); // fallback not called
 * assertEquals(orElse(None<number>(), fallback), Some(100)); // fallback called
 * assertEquals(calls, 1);
 * ```
 */
export function orElse<T>(
	self: Option<T>,
	optionB: () => Option<T>,
): Option<T> {
	return match(self)({
		Some,
		None: optionB,
	});
}

/**
 * Combines two Options into a single Option containing a tuple of both values.
 *
 * Returns Some([first, second]) if both Options are Some, otherwise returns None.
 *
 * @param self - The first Option
 * @param other - The second Option
 * @returns Some containing a tuple of both values if both are Some, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, zip } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(zip(Some(1), Some("hi")), Some([1, "hi"]));
 * assertEquals(zip(Some(1), None()), None());
 * assertEquals(zip(None(), Some("hi")), None());
 * assertEquals(zip(None(), None()), None());
 * ```
 */
export function zip<T, U>(
	self: Option<T>,
	other: Option<U>,
): Option<[first: T, second: U]> {
	return match(self)({
		Some(value) {
			return match(other)({
				Some: (otherValue) => Some([value, otherValue]),
				None,
			});
		},
		None,
	});
}

/**
 * Combines two Options by applying a mapping function to both values.
 *
 * Returns Some(mapping(first, second)) if both Options are Some, otherwise returns None.
 * This is equivalent to zipping the Options and then mapping over the result.
 *
 * @param self - The first Option
 * @param other - The second Option
 * @param mapping - Function to apply to both values
 * @returns Some containing the result of mapping if both Options are Some, otherwise None
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, zipWith } from "@sekhmet/enum/option/mini";
 *
 * const add = (a: number, b: number) => a + b;
 *
 * assertEquals(zipWith(Some(1), Some(2), add), Some(3));
 * assertEquals(zipWith(Some(1), None<number>(), add), None());
 * assertEquals(zipWith(None<number>(), Some(2), add), None());
 * ```
 */
export function zipWith<T, U, V>(
	self: Option<T>,
	other: Option<U>,
	mapping: (first: T, second: U) => V,
): Option<V> {
	return map(zip(self, other), (value) => mapping(...value));
}

/**
 * Returns the contained value if Some, otherwise returns the sentinel value.
 *
 * This allows unwrapping an Option with a default value that may be of a different type.
 * Similar to unwrapOr but allows different types for the default value.
 *
 * @param self - The Option to unwrap
 * @param sentinel - The value to return if self is None
 * @returns The contained value if Some, otherwise the sentinel value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, coalesce } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(coalesce(Some(42), "default"), 42);
 * assertEquals(coalesce(None(), "default"), "default");
 * ```
 */
export function coalesce<T, U>(self: Option<T>, sentinel: U): T | U {
	return match(self)({
		Some: (value): T | U => value,
		None: () => sentinel,
	});
}

/**
 * Splits an Option of a tuple into a tuple of Options.
 *
 * Converts Some([first, second]) into [Some(first), Some(second)].
 * Converts None into [None(), None()].
 *
 * @param opt - An Option containing a tuple of two values
 * @returns A tuple of two Options, one for each value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, unzip } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(unzip(Some<[number, string]>([1, "hi"])), [Some(1), Some("hi")]);
 * assertEquals(unzip(None()), [None(), None()]);
 * ```
 */
export function unzip<T, U>(
	opt: Option<[first: T, second: U]>,
): [first: Option<T>, second: Option<U>] {
	return mapOr(opt, [None(), None()], ([first, second]) => {
		return [Some(first), Some(second)] as const;
	});
}

/**
 * Transposes an Option of a Result into a Result of an Option.
 *
 * Converts Some(Ok(x)) into Ok(Some(x)).
 * Converts Some(Err(e)) into Err(e).
 * Converts None into Ok(None()).
 *
 * @param opt - An Option containing a Result
 * @returns A Result containing an Option
 *
 * @example
 * ```ts
 * import { None, Some, transpose } from "@sekhmet/enum/option/mini";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 *
 * transpose(Some(Ok(5)));       // Ok(Some(5))
 * transpose(Some(Err("fail"))); // Err("fail")
 * transpose(None());            // Ok(None())
 * ```
 */
export function transpose<T, E>(
	opt: Option<Result<T, E>>,
): Result<Option<T>, E> {
	return mapOr(opt, Ok(None()), (result) =>
		match(result)({
			Ok: (value): Result<Option<T>, E> => Ok(Some(value)),
			Err: (err): Result<Option<T>, E> => Err(err),
		}),
	);
}

/**
 * Flattens a nested Option into a single-level Option.
 *
 * Converts Some(Some(x)) into Some(x).
 * Converts Some(None) or None into None.
 *
 * @param opt - An Option containing another Option
 * @returns The flattened Option
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, flatten } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(flatten(Some(Some(6))), Some(6));
 * assertEquals(flatten(Some(None())), None());
 * assertEquals(flatten(None()), None());
 * ```
 */
export function flatten<T>(opt: Option<Option<T>>): Option<T> {
	return unwrapOr(opt, None());
}
