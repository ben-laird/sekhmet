/**
 * `invariantEqual`: an invariant check that two values are equal, like Rust's
 * `assert_eq!`, showing both when they are not.
 *
 * @module
 */

import { readField } from "../workflow-panic/read.ts";
import type { InvariantOptions } from "./invariant.ts";
import { violated } from "./violation.ts";

/** What {@linkcode invariantEqual} is given. */
export interface InvariantEqualOptions<T> extends InvariantOptions {
	/** The value the program computed */
	readonly actual: T;
	/** The value the program should have computed */
	readonly expected: T;
	/**
	 * Whether `actual` equals `expected`; `Object.is` when left out. It takes
	 * no part in inferring `T`, which comes from the values alone.
	 */
	readonly equals?: (actual: NoInfer<T>, expected: NoInfer<T>) => boolean;
}

/**
 * Asserts that `actual` equals `expected`, and otherwise panics as
 * `Panic (Invariant)`, showing both. Values are equal by `Object.is` unless
 * `equals` says otherwise, so `NaN` equals `NaN`, `0` does not equal `-0`,
 * and objects are equal only to themselves; pass `equals` to compare them by
 * content. Both values share one type, so comparing a number with a string
 * is a type error.
 *
 * ```txt
 * an invariant was violated
 * Expected behavior: every key should have a value
 * Actual value: 1
 * Expected value: 2
 * ```
 *
 * @param options The actual and expected values, the expected behavior, an
 *   optional comparator and an optional issue URL
 * @returns Nothing; it panics when the values are not equal
 *
 * @example
 * ```ts
 * import {
 *   invariantEqual,
 *   isInvariantPanic,
 * } from "@sekhmet/workflow/invariant";
 * import { assert, assertEquals, assertThrows } from "@std/assert";
 *
 * const zip = (keys: string[], values: number[]): [string, number][] => {
 *   invariantEqual({
 *     actual: values.length,
 *     expected: keys.length,
 *     expectedBehavior: "every key should have a value",
 *   });
 *   return keys.map((key, index) => [key, values[index] ?? 0]);
 * };
 *
 * assertEquals(zip(["a"], [1]), [["a", 1]]);
 *
 * const thrown = assertThrows(() => zip(["a", "b"], [1]));
 * assert(isInvariantPanic(thrown));
 * assertEquals(thrown.cause.check, { kind: "equal", actual: 1, expected: 2 });
 * ```
 */
export function invariantEqual<T>(options: InvariantEqualOptions<T>): void {
	const actual = optionField({ options, key: "actual" });
	const expected = optionField({ options, key: "expected" });
	if (equal({ actual, expected, options })) {
		return;
	}
	violated({ check: { kind: "equal", actual, expected }, options });
}

/** A field of the caller's options, read without throwing. */
function optionField({
	options,
	key,
}: {
	options: unknown;
	key: string;
}): unknown {
	const read = readField({ from: options, key });
	return read.kind === "present" ? read.value : undefined;
}

/**
 * Whether `actual` equals `expected`: by the caller's `equals`, called as a
 * method of `options`, or by `Object.is` without one. An `equals` that is
 * not a function counts nothing as equal.
 */
function equal({
	actual,
	expected,
	options,
}: {
	actual: unknown;
	expected: unknown;
	options: unknown;
}): boolean {
	const read = readField({ from: options, key: "equals" });
	if (
		read.kind === "absent" ||
		(read.kind === "present" && read.value === undefined)
	) {
		return Object.is(actual, expected);
	}
	if (read.kind !== "present" || typeof read.value !== "function") {
		return false;
	}
	return Boolean(Reflect.apply(read.value, options, [actual, expected]));
}
