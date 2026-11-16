import {
	InvalidType,
	NotMultipleOf,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { check } from "./check.ts";

/**
 * Options for a bound check ({@linkcode min}, {@linkcode max}).
 */
export interface LimitOptions {
	/**
	 * Whether the bound itself is allowed: `true` checks `>=`/`<=`, `false`
	 * checks `>`/`<`.
	 *
	 * @default true
	 */
	inclusive?: boolean;
}

/**
 * Checks that a number is an integer; anything else fails with an
 * `InvalidType` issue expecting `"integer"`.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The number schema to check
 * @returns A schema that also rejects non-integers
 *
 * @example
 * ```ts
 * import { assert } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { int, number } from "@sekhmet/schema/primitives/mini";
 *
 * const count = int(number());
 *
 * assert(isOk(parseSync(count, 3)));
 * assert(isErr(parseSync(count, 3.5)));
 * ```
 */
export function int<I, E>(
	self: Schema<I, number, E>,
): Schema<I, number, E | SchemaIssue> {
	return check(self, (value) =>
		Number.isInteger(value)
			? undefined
			: InvalidType({ input: value, expected: "integer" }),
	);
}

/**
 * Checks that a number is a safe integer, one that a `number` represents
 * exactly (`Number.MIN_SAFE_INTEGER` to `Number.MAX_SAFE_INTEGER`). A
 * non-integer fails with `InvalidType`; an integer out of range with
 * `TooSmall` or `TooBig`.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The number schema to check
 * @returns A schema that also rejects unsafe integers
 *
 * @example
 * ```ts
 * import { assert } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number, safe } from "@sekhmet/schema/primitives/mini";
 *
 * const id = safe(number());
 *
 * assert(isOk(parseSync(id, 2 ** 53 - 1)));
 * assert(isErr(parseSync(id, 2 ** 53)));
 * ```
 */
export function safe<I, E>(
	self: Schema<I, number, E>,
): Schema<I, number, E | SchemaIssue> {
	return check(self, (value) => {
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
	});
}

/** The number of digits after the decimal point in a number's shortest form. */
function decimals(value: number): number {
	const [mantissa = "", exponent = "0"] = value.toString().split("e");
	const fraction = mantissa.split(".")[1] ?? "";

	return Math.max(0, fraction.length - Number(exponent));
}

/**
 * Checks that a number is a multiple of `divisor`, failing with a
 * `NotMultipleOf` issue. Decimal divisors compare at the precision of their
 * written form, so `0.3` is a multiple of `0.1` despite floating point.
 *
 * Panics with a `RangeError` when `divisor` is not a positive finite number.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The number schema to check
 * @param divisor The positive number the value must be a multiple of
 * @returns A schema that also rejects non-multiples
 *
 * @example
 * ```ts
 * import { assert } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { multipleOf, number } from "@sekhmet/schema/primitives/mini";
 *
 * const price = multipleOf(number(), 0.01);
 *
 * assert(isOk(parseSync(price, 19.99)));
 * assert(isErr(parseSync(price, 19.999)));
 * ```
 */
export function multipleOf<I, E>(
	self: Schema<I, number, E>,
	divisor: number,
): Schema<I, number, E | SchemaIssue> {
	if (!(Number.isFinite(divisor) && divisor > 0)) {
		throw new RangeError(
			`multipleOf needs a positive finite divisor, got ${divisor}`,
		);
	}

	return check(self, (value) => {
		const scale = 10 ** Math.max(decimals(value), decimals(divisor));
		const remainder = Math.round(value * scale) % Math.round(divisor * scale);

		return remainder === 0
			? undefined
			: NotMultipleOf({ input: value, origin: "number", divisor });
	});
}

/**
 * Checks that a number is at least `minimum` (or above it, with
 * `inclusive: false`), failing with a `TooSmall` issue.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The number schema to check
 * @param minimum The lower bound
 * @param options Whether the bound is inclusive (the default)
 * @returns A schema that also rejects values below the bound
 *
 * @example
 * ```ts
 * import { assert } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { min, number } from "@sekhmet/schema/primitives/mini";
 *
 * const positive = min(number(), 0, { inclusive: false });
 *
 * assert(isOk(parseSync(positive, 0.5)));
 * assert(isErr(parseSync(positive, 0)));
 * ```
 */
export function min<I, E>(
	self: Schema<I, number, E>,
	minimum: number,
	options?: LimitOptions,
): Schema<I, number, E | SchemaIssue> {
	const inclusive = options?.inclusive ?? true;

	return check(self, (value) =>
		(inclusive ? value >= minimum : value > minimum)
			? undefined
			: TooSmall({ input: value, origin: "number", minimum, inclusive }),
	);
}

/**
 * Checks that a number is at most `maximum` (or below it, with
 * `inclusive: false`), failing with a `TooBig` issue.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The number schema to check
 * @param maximum The upper bound
 * @param options Whether the bound is inclusive (the default)
 * @returns A schema that also rejects values above the bound
 *
 * @example
 * ```ts
 * import { assert } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { max, number } from "@sekhmet/schema/primitives/mini";
 *
 * const percent = max(number(), 100);
 *
 * assert(isOk(parseSync(percent, 100)));
 * assert(isErr(parseSync(percent, 101)));
 * ```
 */
export function max<I, E>(
	self: Schema<I, number, E>,
	maximum: number,
	options?: LimitOptions,
): Schema<I, number, E | SchemaIssue> {
	const inclusive = options?.inclusive ?? true;

	return check(self, (value) =>
		(inclusive ? value <= maximum : value < maximum)
			? undefined
			: TooBig({ input: value, origin: "number", maximum, inclusive }),
	);
}
