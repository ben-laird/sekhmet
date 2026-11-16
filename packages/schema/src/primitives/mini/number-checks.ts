/**
 * The checks behind `number`'s options. Internal: the barrel does not
 * re-export this module.
 *
 * @module
 */

import {
	InvalidType,
	NotMultipleOf,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { atLeast, atMost, type Bound, limitOf } from "./bound.ts";
import type { Inspect } from "./check.ts";

/** Fails a non-integer with an `InvalidType` issue expecting `"integer"`. */
export const isInteger: Inspect<number> = (value) =>
	Number.isInteger(value)
		? undefined
		: InvalidType({ input: value, expected: "integer" });

/**
 * Fails a value that is not a safe integer, one a `number` represents
 * exactly: a non-integer with `InvalidType`, an integer out of range with
 * `TooSmall` or `TooBig`.
 */
export const isSafeInteger: Inspect<number> = (value) => {
	if (!Number.isInteger(value)) {
		return InvalidType({ input: value, expected: "integer" });
	}
	if (value < Number.MIN_SAFE_INTEGER) {
		return TooSmall({
			input: value,
			origin: "number",
			minimum: Number.MIN_SAFE_INTEGER,
			inclusive: true,
		});
	}
	if (value > Number.MAX_SAFE_INTEGER) {
		return TooBig({
			input: value,
			origin: "number",
			maximum: Number.MAX_SAFE_INTEGER,
			inclusive: true,
		});
	}

	return undefined;
};

/** The number of digits after the decimal point in a number's shortest form. */
function decimals(value: number): number {
	const [mantissa = "", exponent = "0"] = value.toString().split("e");
	const fraction = mantissa.split(".")[1] ?? "";

	return Math.max(0, fraction.length - Number(exponent));
}

/**
 * Fails a value that is not a multiple of `divisor` with `NotMultipleOf`.
 * Decimal divisors compare at the precision of their written form, so `0.3`
 * is a multiple of `0.1` despite floating point.
 *
 * Panics with a `RangeError` when `divisor` is not a positive finite number.
 */
export function multipleOf(divisor: number): Inspect<number> {
	if (!(Number.isFinite(divisor) && divisor > 0)) {
		throw new RangeError(
			`multipleOf needs a positive finite divisor, got ${divisor}`,
		);
	}

	return (value) => {
		const scale = 10 ** Math.max(decimals(value), decimals(divisor));
		const remainder = Math.round(value * scale) % Math.round(divisor * scale);

		return remainder === 0
			? undefined
			: NotMultipleOf({ input: value, origin: "number", divisor });
	};
}

const isNumber = (bound: Bound<number>): bound is number =>
	typeof bound === "number";
const identity = (value: number): number => value;

/** Fails a value below `bound` with `TooSmall`. */
export function minimum(bound: Bound<number>): Inspect<number> {
	const limit = limitOf({ bound, isValue: isNumber });

	return atLeast({
		limit,
		measure: identity,
		tooSmall: (input) =>
			TooSmall({
				input,
				origin: "number",
				minimum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}

/** Fails a value above `bound` with `TooBig`. */
export function maximum(bound: Bound<number>): Inspect<number> {
	const limit = limitOf({ bound, isValue: isNumber });

	return atMost({
		limit,
		measure: identity,
		tooBig: (input) =>
			TooBig({
				input,
				origin: "number",
				maximum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}
