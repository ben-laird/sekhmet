import { Err, Ok } from "@sekhmet/enum/result/mini";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { atLeast, atMost, type Bound, limitOf } from "./bound.ts";
import { type Inspect, leaf, when } from "./check.ts";

/** Options for the date schema. Every check is off unless set. */
export interface DateSchemaOptions {
	/**
	 * The earliest date allowed (see {@linkcode Bound}); an earlier one fails
	 * with `TooSmall`.
	 */
	readonly min?: Bound<Date>;

	/**
	 * The latest date allowed (see {@linkcode Bound}); a later one fails with
	 * `TooBig`.
	 */
	readonly max?: Bound<Date>;
}

const isDate = (bound: Bound<Date>): bound is Date => bound instanceof Date;
const time = (value: Date): number => value.getTime();

function minimum(bound: Bound<Date>): Inspect<Date> {
	const limit = limitOf({ bound, isValue: isDate });

	return atLeast({
		limit,
		measure: time,
		tooSmall: (input) =>
			TooSmall({
				input,
				origin: "date",
				minimum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}

function maximum(bound: Bound<Date>): Inspect<Date> {
	const limit = limitOf({ bound, isValue: isDate });

	return atMost({
		limit,
		measure: time,
		tooBig: (input) =>
			TooBig({
				input,
				origin: "date",
				maximum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}

/**
 * Creates a schema that accepts only valid `Date` objects. Anything else,
 * including an `Invalid Date` (one whose time is `NaN`), fails with an
 * `InvalidType` issue; the issue's `received` tells the two apart
 * (`"invalid date"`). It does not coerce: a date string or a timestamp is
 * rejected. The accepted `Date` is returned as is, not copied.
 *
 * The checks compare times, in this order, and the first that fails is
 * reported: `min`, `max`.
 *
 * @param options The checks
 * @returns A schema accepting only valid dates
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { date } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(date(), new Date(0))), true);
 * assertEquals(isErr(parseSync(date(), new Date("nope"))), true);
 * assertEquals(isErr(parseSync(date(), "1970-01-01")), true);
 *
 * const modern = date({ min: new Date("2000-01-01T00:00:00Z") });
 * assertEquals(isErr(parseSync(modern, new Date(0))), true);
 * ```
 */
export function date(
	options?: DateSchemaOptions,
): Schema<unknown, Date, SchemaIssue> {
	return leaf({
		details: { type: "date", options: options ?? {} },
		read: (input) => {
			if (input instanceof Date && !Number.isNaN(input.getTime())) {
				return Ok(input);
			}

			return Err(InvalidType({ input, expected: "date" }));
		},
		inspections: [
			...when({ option: options?.min, inspect: minimum }),
			...when({ option: options?.max, inspect: maximum }),
		],
	});
}
