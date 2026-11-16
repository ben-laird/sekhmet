import { Err, Ok } from "@sekhmet/enum/result/mini";
import {
	InvalidType,
	NotMultipleOf,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { atLeast, atMost, type Bound, limitOf } from "./bound.ts";
import { type Inspect, leaf, when } from "./check.ts";

/** Options for the bigint schema. Every check is off unless set. */
export interface BigintSchemaOptions {
	/**
	 * The lowest value allowed (see {@linkcode Bound}); a value below it
	 * fails with `TooSmall`.
	 */
	readonly min?: Bound<bigint>;

	/**
	 * The highest value allowed (see {@linkcode Bound}); a value above it
	 * fails with `TooBig`.
	 */
	readonly max?: Bound<bigint>;

	/**
	 * A positive bigint the value must be a multiple of, failing with
	 * `NotMultipleOf`. The schema panics with a `RangeError` when it is not
	 * positive.
	 */
	readonly multipleOf?: bigint;
}

const isBigint = (bound: Bound<bigint>): bound is bigint =>
	typeof bound === "bigint";
const identity = (value: bigint): bigint => value;

function minimum(bound: Bound<bigint>): Inspect<bigint> {
	const limit = limitOf({ bound, isValue: isBigint });

	return atLeast({
		limit,
		measure: identity,
		tooSmall: (input) =>
			TooSmall({
				input,
				origin: "bigint",
				minimum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}

function maximum(bound: Bound<bigint>): Inspect<bigint> {
	const limit = limitOf({ bound, isValue: isBigint });

	return atMost({
		limit,
		measure: identity,
		tooBig: (input) =>
			TooBig({
				input,
				origin: "bigint",
				maximum: limit.value,
				inclusive: limit.inclusive,
			}),
	});
}

function multipleOf(divisor: bigint): Inspect<bigint> {
	if (divisor <= 0n) {
		throw new RangeError(`multipleOf needs a positive divisor, got ${divisor}`);
	}

	return (value) =>
		value % divisor === 0n
			? undefined
			: NotMultipleOf({ input: value, origin: "bigint", divisor });
}

/**
 * Creates a schema that accepts only bigints, failing with an `InvalidType`
 * issue otherwise. It does not coerce: a number is rejected.
 *
 * The checks run in this order, and the first that fails is reported:
 * `min`, `max`, `multipleOf`.
 *
 * @param options The checks
 * @returns A schema accepting only bigints
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { bigint } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(isOk(parseSync(bigint(), 10n)), true);
 * assertEquals(isErr(parseSync(bigint(), 10)), true);
 *
 * const even = bigint({ min: 0n, multipleOf: 2n });
 * assertEquals(isOk(parseSync(even, 2n ** 64n)), true);
 * assertEquals(isErr(parseSync(even, 3n)), true);
 * ```
 */
export function bigint(
	options?: BigintSchemaOptions,
): Schema<unknown, bigint, SchemaIssue> {
	return leaf({
		read: (input) => {
			if (typeof input === "bigint") return Ok(input);

			return Err(InvalidType({ input, expected: "bigint" }));
		},
		inspections: [
			...when({ option: options?.min, inspect: minimum }),
			...when({ option: options?.max, inspect: maximum }),
			...when({ option: options?.multipleOf, inspect: multipleOf }),
		],
	});
}
