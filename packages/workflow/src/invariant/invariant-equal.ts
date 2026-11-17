/**
 * `invariantEqual`: an invariant check that two values are equal, like Rust's
 * `assert_eq!`, showing both when they are not.
 *
 * @module
 */

import { readField } from "../workflow-panic/read.ts";
import type { InvariantOptions } from "./invariant.ts";
import { violated } from "./violation.ts";

/** The two values {@linkcode InvariantEqualOptions.equals} compares. */
export interface InvariantEqualValues<T> {
	/** The value the program computed */
	readonly actual: T;
	/** The value the program should have computed */
	readonly expected: T;
}

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
	readonly equals?: (values: InvariantEqualValues<NoInfer<T>>) => boolean;
}

/**
 * Asserts that `actual` equals `expected`, and otherwise panics as
 * `Panic (Invariant)`, showing both. Values are equal by `Object.is` unless
 * `equals({ actual, expected })` says otherwise, so `NaN` equals `NaN`, `0` does not equal `-0`,
 * and objects are equal only to themselves; pass `equals` to compare them by
 * content. TypeScript infers one type `T` from both values: unrelated types,
 * such as a number and a string, are a type error, while a number and `null`
 * infer `T` as `number | null` and compile.
 *
 * It fails closed: options that are missing, or whose `actual` or `expected`
 * is missing or cannot be read (a throwing getter, say), panic as unequal.
 * An `equals` that throws is not caught: its error propagates unchanged, as
 * from `Array.prototype.filter`, and only an unequal pair panics.
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
	const actual = readField({ from: options, key: "actual" });
	const expected = readField({ from: options, key: "expected" });
	if (
		actual.kind === "present" &&
		expected.kind === "present" &&
		equal({ actual: actual.value, expected: expected.value, options })
	) {
		return;
	}
	const check: { kind: "equal"; actual?: unknown; expected?: unknown } = {
		kind: "equal",
	};
	if (actual.kind === "present") {
		check.actual = actual.value;
	}
	if (expected.kind === "present") {
		check.expected = expected.value;
	}
	violated({ check, options });
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
	return Boolean(Reflect.apply(read.value, options, [{ actual, expected }]));
}
