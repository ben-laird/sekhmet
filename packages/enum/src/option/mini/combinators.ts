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
 * ```ts ignore
 * for (const value of iter(Some(42))) {
 *   console.log(value); // 42
 * }
 *
 * for (const value of iter(None())) {
 *   console.log(value); // never executed
 * }
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
 * ```ts ignore
 * and(Some(2), Some("foo")); // Some("foo")
 * and(None(), Some("foo"));  // None
 * and(Some(2), None());      // None
 * and(None(), None());       // None
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
 * ```ts ignore
 * const divide = (x: number) => (y: number): Option<number> =>
 *   y === 0 ? None() : Some(x / y);
 *
 * andThen(Some(4), divide(2)); // Some(2)
 * andThen(Some(0), divide(2)); // None (division by zero)
 * andThen(None(), divide(2));  // None
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
 * ```ts ignore
 * const isEven = (n: number) => n % 2 === 0;
 *
 * filter(Some(4), isEven);  // Some(4)
 * filter(Some(3), isEven);  // None
 * filter(None(), isEven);   // None
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
 * ```ts ignore
 * or(Some(2), Some(100)); // Some(2)
 * or(None(), Some(100));  // Some(100)
 * or(Some(2), None());    // Some(2)
 * or(None(), None());     // None
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
 * ```ts ignore
 * const expensive = () => Some(expensiveComputation());
 *
 * orElse(Some(2), expensive); // Some(2) - expensive() not called
 * orElse(None(), expensive);  // Some(result) - expensive() called
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
 * ```ts ignore
 * zip(Some(1), Some("hi")); // Some([1, "hi"])
 * zip(Some(1), None());     // None
 * zip(None(), Some("hi"));  // None
 * zip(None(), None());      // None
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
 * ```ts ignore
 * const add = (a: number, b: number) => a + b;
 *
 * zipWith(Some(1), Some(2), add); // Some(3)
 * zipWith(Some(1), None(), add);  // None
 * zipWith(None(), Some(2), add);  // None
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
 * ```ts ignore
 * coalesce(Some(42), "default"); // 42
 * coalesce(None(), "default");   // "default"
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
 * ```ts ignore
 * unzip(Some([1, "hi"])); // [Some(1), Some("hi")]
 * unzip(None());          // [None(), None()]
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
 * ```ts ignore
 * transpose(Some(Ok(5)));      // Ok(Some(5))
 * transpose(Some(Err("fail"))); // Err("fail")
 * transpose(None());           // Ok(None())
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
 * ```ts ignore
 * flatten(Some(Some(6))); // Some(6)
 * flatten(Some(None()));  // None
 * flatten(None());        // None
 * ```
 */
export function flatten<T>(opt: Option<Option<T>>): Option<T> {
	return unwrapOr(opt, None());
}
