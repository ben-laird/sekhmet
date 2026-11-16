import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import type { Bound } from "./bound.ts";
import { firstIssue, type Inspect, leaf, when } from "./check.ts";
import type { CoerceMode } from "./coerce.ts";
import { coerceNumber } from "./convert.ts";
import {
	isInteger,
	isSafeInteger,
	maximum,
	minimum,
	multipleOf,
} from "./number-checks.ts";

/**
 * Options for configuring the number schema. Every check is off unless set.
 */
export interface NumberSchemaOptions {
	/**
	 * How a non-number is treated (see {@linkcode CoerceMode}): rejected
	 * (`false`), strictly coerced (`true`: trimmed decimal or exponent
	 * strings, booleans as 1/0, bigints in the safe-integer range), or
	 * converted with `Number()` (`"native"`). A coerced value is still
	 * checked, so `NaN` from `Number("abc")` fails unless `nan: true`.
	 *
	 * @default false
	 */
	readonly coerce?: CoerceMode;

	/**
	 * Whether `NaN` is accepted. By default it fails with an `InvalidType`
	 * issue (received `"nan"`). Allowed means accepted: with `nan: true`, `NaN`
	 * passes without any other check (`min`, `max`, `int`, `safe`,
	 * `multipleOf`), since none of them means anything for it.
	 *
	 * @default false
	 */
	readonly nan?: boolean;

	/**
	 * Whether `Infinity` and `-Infinity` are accepted. By default they fail
	 * with an `InvalidType` issue (received `"infinity"`). With
	 * `infinite: true` they still meet `min` and `max`, which compare them
	 * meaningfully (`Infinity` fails `max: 10` and passes `min: 0`), but skip
	 * `int`, `safe` and `multipleOf`.
	 *
	 * @default false
	 */
	readonly infinite?: boolean;

	/**
	 * Whether the number must be an integer; anything else fails with an
	 * `InvalidType` issue expecting `"integer"`.
	 *
	 * @default false
	 */
	readonly int?: boolean;

	/**
	 * Whether the number must be a safe integer, one a `number` represents
	 * exactly (`Number.MIN_SAFE_INTEGER` to `Number.MAX_SAFE_INTEGER`). A
	 * non-integer fails with `InvalidType`; an integer out of range with
	 * `TooSmall` or `TooBig`.
	 *
	 * @default false
	 */
	readonly safe?: boolean;

	/**
	 * The lowest value allowed (see {@linkcode Bound}); a value below it
	 * fails with `TooSmall`.
	 */
	readonly min?: Bound<number>;

	/**
	 * The highest value allowed (see {@linkcode Bound}); a value above it
	 * fails with `TooBig`.
	 */
	readonly max?: Bound<number>;

	/**
	 * A positive number the value must be a multiple of, failing with
	 * `NotMultipleOf`. Decimal divisors compare at the precision of their
	 * written form, so `0.3` is a multiple of `0.1` despite floating point.
	 * The schema panics with a `RangeError` when it is not a positive finite
	 * number.
	 */
	readonly multipleOf?: number;
}

/**
 * The number's checks: `NaN` is accepted outright when allowed, `±Infinity`
 * meets only the bounds when allowed, and a finite number meets every check,
 * in the documented order.
 */
function inspectNumber(options: NumberSchemaOptions): Inspect<number> {
	const bounds = [
		...when({ option: options.min, inspect: minimum }),
		...when({ option: options.max, inspect: maximum }),
	];
	const checks = [
		...(options.int === true ? [isInteger] : []),
		...(options.safe === true ? [isSafeInteger] : []),
		...bounds,
		...when({ option: options.multipleOf, inspect: multipleOf }),
	];

	return (value) => {
		if (Number.isNaN(value)) {
			return options.nan === true
				? undefined
				: InvalidType({ input: value, expected: "number" });
		}
		if (!Number.isFinite(value)) {
			return options.infinite === true
				? firstIssue({ value, inspections: bounds })
				: InvalidType({ input: value, expected: "number" });
		}

		return firstIssue({ value, inspections: checks });
	};
}

/**
 * Creates a schema that validates and optionally coerces numeric values.
 *
 * It is strict by default: it accepts only finite numbers (`-0` included),
 * failing with an `InvalidType` issue otherwise. `nan: true` and
 * `infinite: true` allow `NaN` and `±Infinity`.
 *
 * `coerce: true` also accepts trimmed decimal or exponent strings
 * (`" 12 "`, `"1e3"`), booleans as 1/0 and bigints in the safe-integer
 * range, and rejects `""`, `"0x10"`, `null`, `undefined`, `[]` and `{}`.
 * `coerce: "native"` uses `Number()` instead, whose result is still
 * checked.
 *
 * The checks run on the (coerced) number in this order, and the first that
 * fails is reported: `NaN`/`±Infinity`, `int`, `safe`, `min`, `max`,
 * `multipleOf`. An allowed `NaN` skips every other check, and an allowed
 * `±Infinity` meets only `min` and `max`.
 *
 * @param options Coercion and checks
 * @returns A schema that validates numeric inputs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const schema = number();
 *
 * assertEquals(unwrap(parseSync(schema, 42)), 42);
 * assertEquals(isErr(parseSync(schema, Number.NaN)), true);
 * assertEquals(isErr(parseSync(schema, "42")), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const percent = number({ int: true, min: 0, max: 100 });
 * const positive = number({ min: { value: 0, inclusive: false } });
 * const price = number({ multipleOf: 0.01 });
 *
 * assertEquals(isOk(parseSync(percent, 100)), true);
 * assertEquals(isErr(parseSync(percent, 2.5)), true);
 * assertEquals(isErr(parseSync(positive, 0)), true);
 * assertEquals(isErr(parseSync(price, 19.999)), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const strict = number({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, " 1e3 ")), 1000);
 * assertEquals(isErr(parseSync(strict, "")), true);
 *
 * const native = number({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, "")), 0);
 * assertEquals(isErr(parseSync(native, "abc")), true);
 * ```
 */
export function number(
	options?: NumberSchemaOptions,
): Schema<unknown, number, SchemaIssue> {
	return numberSchema(options ?? {});
}

function numberSchema(
	options: NumberSchemaOptions,
): Schema<unknown, number, SchemaIssue> {
	const mode = options.coerce ?? false;

	return leaf({
		details: { type: "number", options },
		read: (input) => {
			const value = coerceNumber({ input, mode });

			if (value === undefined) {
				return Err(InvalidType({ input, expected: "number" }));
			}

			return Ok(value);
		},
		inspections: [inspectNumber(options)],
	});
}
