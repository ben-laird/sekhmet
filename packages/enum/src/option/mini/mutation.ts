import { getStructParams } from "@sekhmet/primordials/struct";

import { match } from "@/src/core/mini/exit.ts";
import { None, Option, Some } from "./core.ts";

/**
 * Inserts a value into the Option, making it Some, and returns the inserted value.
 *
 * This is a mutating operation that changes the Option in place. If the Option was None,
 * it becomes Some. If it was already Some, the old value is replaced.
 *
 * @param self - The Option to insert into
 * @param value - The value to insert
 * @returns The inserted value
 *
 * @example
 * ```ts ignore
 * const opt = None<number>();
 * insert(opt, 42); // returns 42
 * // opt is now Some(42)
 * ```
 */
export function insert<T>(self: Option<T>, value: T): T {
	const selfState = getStructParams(self);

	selfState.variant = ["Some", value];

	return value;
}

/**
 * Returns the contained value if Some, otherwise inserts the provided value and returns it.
 *
 * This is a mutating operation. If the Option is None, it becomes Some(value).
 * If it's already Some, the Option is unchanged.
 *
 * @param self - The Option to get or insert into
 * @param value - The value to insert if self is None
 * @returns The value that was already present, or the newly inserted value
 *
 * @example
 * ```ts ignore
 * const opt = None<number>();
 * getOrInsert(opt, 5); // returns 5, opt is now Some(5)
 *
 * const opt2 = Some(10);
 * getOrInsert(opt2, 5); // returns 10, opt2 unchanged
 * ```
 */
export function getOrInsert<T>(self: Option<T>, value: T): T {
	return match(self)({
		Some: (value) => value,
		None: () => insert(self, value),
	});
}

/**
 * Returns the contained value if Some, otherwise calls creator and inserts the result.
 *
 * This is a mutating operation. If the Option is None, creator is called and the Option
 * becomes Some(creator()). If it's already Some, creator is not called and the Option
 * is unchanged.
 *
 * @param self - The Option to get or insert into
 * @param creator - Function to create the value if self is None
 * @returns The value that was already present, or the newly created and inserted value
 *
 * @example
 * ```ts ignore
 * const opt = None<number>();
 * getOrInsertWith(opt, () => expensiveComputation()); // calls expensiveComputation()
 *
 * const opt2 = Some(10);
 * getOrInsertWith(opt2, () => expensiveComputation()); // doesn't call expensiveComputation()
 * ```
 */
export function getOrInsertWith<T>(self: Option<T>, creator: () => T): T {
	return match(self)({
		Some: (value) => value,
		None: () => insert(self, creator()),
	});
}

/**
 * Takes the value out of the Option, leaving None in its place.
 *
 * This is a mutating operation. If the Option was Some(value), it becomes None
 * and Some(value) is returned. If it was None, None is returned.
 *
 * @param self - The Option to take from
 * @returns Some(value) if self was Some, otherwise None
 *
 * @example
 * ```ts ignore
 * const opt = Some(42);
 * const taken = take(opt); // Some(42)
 * // opt is now None
 *
 * const opt2 = None<number>();
 * const taken2 = take(opt2); // None
 * // opt2 is still None
 * ```
 */
export function take<T>(self: Option<T>): Option<T> {
	const selfState = getStructParams(self);

	return match(self)({
		Some(value) {
			selfState.variant = ["None"];

			return Some(value);
		},
		None,
	});
}

/**
 * Takes the value out of the Option if it satisfies the predicate, leaving None in its place.
 *
 * This is a mutating operation. If the Option is Some(value) and predicate(value) returns true,
 * the Option becomes None and Some(value) is returned. Otherwise, the Option is unchanged
 * and None is returned.
 *
 * Supports both type guards and regular boolean predicates.
 *
 * @param self - The Option to take from
 * @param predicate - Function that tests the value, can be a type guard or boolean predicate
 * @returns Some(value) if self was Some and the predicate passed, otherwise None
 *
 * @example
 * ```ts ignore
 * const opt = Some(42);
 * const taken = takeIf(opt, (x) => x > 10); // Some(42)
 * // opt is now None
 *
 * const opt2 = Some(5);
 * const taken2 = takeIf(opt2, (x) => x > 10); // None
 * // opt2 is still Some(5)
 * ```
 */
export function takeIf<T, U extends T>(
	self: Option<T>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): Option<U> {
	const selfState = getStructParams(self);

	return match(self)({
		Some(value) {
			const p = predicate as (value: T) => value is U;

			if (!p(value)) return None();

			selfState.variant = ["None"];

			return Some(value);
		},
		None,
	});
}

/**
 * Replaces the value in the Option with a new value, returning the old value.
 *
 * This is a mutating operation. The Option always becomes Some(value) regardless of
 * its previous state. Returns the old value wrapped in an Option (Some if there was
 * a value, None if there wasn't).
 *
 * @param self - The Option to replace the value in
 * @param value - The new value to insert
 * @returns An Option containing the old value (Some if there was one, None otherwise)
 *
 * @example
 * ```ts ignore
 * const opt = Some(5);
 * const old = replace(opt, 10); // Some(5)
 * // opt is now Some(10)
 *
 * const opt2 = None<number>();
 * const old2 = replace(opt2, 10); // None
 * // opt2 is now Some(10)
 * ```
 */
export function replace<T>(self: Option<T>, value: T): Option<T> {
	const selfState = getStructParams(self);

	const oldVariant = selfState.variant;

	selfState.variant = ["Some", value];

	return new Option(...oldVariant);
}
