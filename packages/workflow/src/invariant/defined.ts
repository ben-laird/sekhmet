/**
 * `defined`: an invariant check that a value is present, returning it with
 * `null`, `undefined` or both removed from its type.
 *
 * @module
 */

import { readField } from "../workflow-panic/read.ts";
import type { InvariantOptions } from "./invariant.ts";
import { violated } from "./violation.ts";

/**
 * What counts as absent for {@linkcode defined}: `"nullish"` is `null` and
 * `undefined`, `"undefined"` is `undefined` alone, and `"null"` is `null`
 * alone.
 */
export type DefinedAbsent = "nullish" | "undefined" | "null";

/**
 * `T` without what `A` counts as absent: `NonNullable<T>` for `"nullish"`,
 * `Exclude<T, undefined>` for `"undefined"` and `Exclude<T, null>` for
 * `"null"`.
 */
export type DefinedValue<T, A extends DefinedAbsent> = A extends "undefined"
	? Exclude<T, undefined>
	: A extends "null"
		? Exclude<T, null>
		: NonNullable<T>;

/** What {@linkcode defined} is given besides the value. */
export interface DefinedOptions<A extends DefinedAbsent = DefinedAbsent>
	extends InvariantOptions {
	/** What counts as absent; `"nullish"` when left out */
	readonly absent?: A;
}

/**
 * Returns `value` when it is present, typed without what counts as absent,
 * and otherwise panics as `Panic (Invariant)`. Only `null` and `undefined`
 * can be absent: `0`, `""`, `false` and `NaN` are present. Use it where a
 * missing value means the program has a bug, never to check input.
 *
 * `absent` picks what counts as absent: `"nullish"` (the default) rejects
 * both, `"undefined"` only `undefined` and `"null"` only `null`. The message
 * shows the absent value:
 *
 * ```txt
 * an invariant was violated
 * Expected behavior: every item in the cart should have a price
 * Absent value: undefined
 * ```
 *
 * @param value The value that must be present
 * @param options The expected behavior, what counts as absent, and an
 *   optional issue URL
 * @returns `value`, narrowed to {@linkcode DefinedValue}
 *
 * @example
 * ```ts
 * import { defined, isInvariantPanic } from "@sekhmet/workflow/invariant";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * const prices = new Map([["apple", 2], ["pear", 0]]);
 * const priceOf = (item: string): number => {
 *   return defined(prices.get(item), {
 *     expectedBehavior: "every item in the cart should have a price",
 *   });
 * };
 *
 * assertEquals(priceOf("pear"), 0);
 *
 * const thrown = assertThrows(() => priceOf("plum"));
 * assert(isInvariantPanic(thrown));
 * assertEquals(thrown.cause.check, {
 *   kind: "defined",
 *   absent: "nullish",
 *   value: undefined,
 * });
 * ```
 */
export function defined<T, A extends DefinedAbsent = "nullish">(
	value: T,
	options: DefinedOptions<A>,
): DefinedValue<T, A>;
export function defined(value: unknown, options: DefinedOptions): unknown {
	if (value !== null && value !== undefined) {
		return value;
	}
	const absent = absentOf(options);
	if (value === undefined && absent !== "null") {
		violated({ check: { kind: "defined", absent, value }, options });
	}
	if (value === null && absent !== "undefined") {
		violated({ check: { kind: "defined", absent, value }, options });
	}
	return value;
}

/** The `absent` option, read without throwing; `"nullish"` unless valid. */
function absentOf(options: unknown): DefinedAbsent {
	const read = readField({ from: options, key: "absent" });
	if (read.kind !== "present") {
		return "nullish";
	}
	switch (read.value) {
		case "undefined":
		case "null": {
			return read.value;
		}
		default: {
			return "nullish";
		}
	}
}
