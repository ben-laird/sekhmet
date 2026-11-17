/**
 * Converting a nullable value to an `Option`: `maybe`.
 *
 * @module
 */

import { None, type Option, Some } from "./core.ts";

/**
 * Which values {@linkcode maybe} treats as absent:
 * - `"nullish"`: `null` and `undefined`
 * - `"undefined"`: `undefined` only (`null` is a present value)
 * - `"null"`: `null` only (`undefined` is a present value)
 */
export type Absent = "nullish" | "undefined" | "null";

/**
 * Options for {@linkcode maybe}.
 *
 * @template A - Which values count as absent, or `undefined` for the default
 */
export type MaybeOptions<A extends Absent | undefined> = {
	/** Which values count as absent; `undefined` or missing means `"nullish"`. */
	absent?: A | undefined;
};

/**
 * The type of `T` once the values that `A` counts as absent are removed.
 *
 * `undefined` is the `"nullish"` default. A union of modes gives the union of
 * their narrowings, since any of them may apply at runtime. `never`, which no
 * mode can be at runtime, also gives the `"nullish"` default that
 * {@linkcode maybe} falls back to.
 *
 * @template T - The possibly absent type
 * @template A - Which values count as absent, or `undefined` for the default
 */
export type Present<T, A extends Absent | undefined> = [A] extends [never]
	? NonNullable<T>
	: A extends "undefined"
		? Exclude<T, undefined>
		: A extends "null"
			? Exclude<T, null>
			: NonNullable<T>;

/**
 * Wraps a value in an `Option`: `None` when it is absent, `Some` otherwise.
 *
 * Only `null` and `undefined` can be absent, never a falsy value: `0`, `""`,
 * `false` and `NaN` are all `Some`. The `absent` option picks which of the
 * two count, and the `Some` type narrows to match.
 *
 * @template T - The possibly absent type
 * @template A - Which values count as absent, or `undefined` for the default
 * @param value - The value to wrap
 * @param options - Which values count as absent (`"nullish"` when missing or `undefined`)
 * @returns `None` if `value` is absent, otherwise `Some(value)`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { maybe, None, Some } from "@sekhmet/enum/option/mini";
 *
 * assertEquals(maybe(0), Some(0));
 * assertEquals(maybe(null), None());
 * assertEquals(maybe(null, { absent: "undefined" }), Some(null));
 * assertEquals(maybe(undefined, { absent: "null" }), Some(undefined));
 * ```
 */
export function maybe<T, A extends Absent | undefined = undefined>(
	value: T,
	options?: MaybeOptions<A>,
): Option<Present<T, A>> {
	const isPresent = presenceIn<T, A>(options?.absent);
	if (isPresent(value)) return Some(value);

	return None();
}

/**
 * The guard for the values that mode `absent` doesn't count as absent. A
 * missing mode is `"nullish"`, whose present values are present in every mode.
 */
function presenceIn<T, A extends Absent | undefined>(
	absent: A | undefined,
): (value: T) => value is Present<T, A> {
	return (value): value is Present<T, A> => {
		switch (absent) {
			case undefined:
			case "nullish":
				return value !== null && value !== undefined;
			case "undefined":
				return value !== undefined;
			case "null":
				return value !== null;
		}
	};
}
