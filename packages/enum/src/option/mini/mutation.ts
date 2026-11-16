/**
 * Changing an option in place: `insert`, `getOrInsert`, `take`, `replace` and
 * their variants. These mutate the option they are given.
 *
 * @module
 */

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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, insert } from "@sekhmet/enum/option/mini";
 *
 * const opt = None<number>();
 * assertEquals(insert(opt, 42), 42);
 * assertEquals(opt, Some(42));
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, getOrInsert } from "@sekhmet/enum/option/mini";
 *
 * const opt = None<number>();
 * assertEquals(getOrInsert(opt, 5), 5);
 * assertEquals(opt, Some(5));
 *
 * const opt2 = Some(10);
 * assertEquals(getOrInsert(opt2, 5), 10);
 * assertEquals(opt2, Some(10)); // unchanged
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, getOrInsertWith } from "@sekhmet/enum/option/mini";
 *
 * let calls = 0;
 * const create = () => {
 *   calls++;
 *   return 5;
 * };
 *
 * const opt = None<number>();
 * assertEquals(getOrInsertWith(opt, create), 5); // calls create
 * assertEquals(opt, Some(5));
 *
 * const opt2 = Some(10);
 * assertEquals(getOrInsertWith(opt2, create), 10); // doesn't call create
 * assertEquals(calls, 1);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, take } from "@sekhmet/enum/option/mini";
 *
 * const opt = Some(42);
 * assertEquals(take(opt), Some(42));
 * assertEquals(opt, None()); // opt is now None
 *
 * const opt2 = None<number>();
 * assertEquals(take(opt2), None());
 * assertEquals(opt2, None()); // opt2 is still None
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, takeIf } from "@sekhmet/enum/option/mini";
 *
 * const opt = Some(42);
 * assertEquals(takeIf(opt, (x) => x > 10), Some(42));
 * assertEquals(opt, None()); // opt is now None
 *
 * const opt2 = Some(5);
 * assertEquals(takeIf(opt2, (x) => x > 10), None());
 * assertEquals(opt2, Some(5)); // opt2 is still Some(5)
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { None, Some, replace } from "@sekhmet/enum/option/mini";
 *
 * const opt = Some(5);
 * assertEquals(replace(opt, 10), Some(5));
 * assertEquals(opt, Some(10));
 *
 * const opt2 = None<number>();
 * assertEquals(replace(opt2, 10), None());
 * assertEquals(opt2, Some(10));
 * ```
 */
export function replace<T>(self: Option<T>, value: T): Option<T> {
	const selfState = getStructParams(self);

	const oldVariant = selfState.variant;

	selfState.variant = ["Some", value];

	return new Option(...oldVariant);
}
