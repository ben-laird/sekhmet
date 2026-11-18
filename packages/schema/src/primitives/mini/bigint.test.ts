import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertThrows } from "@std/assert";
import {
	InvalidType,
	NotMultipleOf,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { bigint } from "./bigint.ts";

Deno.test("bigint's min and max bound it, with each bound's inclusivity", () => {
	// Given: bigints in (0n, 2^64]
	const top = 2n ** 64n;
	const schema = bigint({ min: { value: 0n, inclusive: false }, max: top });

	// When: parsing the bounds and values beyond them
	// Then: the inclusive maximum passes and the rest fail with their issue
	assertEquals(parseSync(schema, 1n), Ok(1n));
	assertEquals(parseSync(schema, top), Ok(top));
	assertEquals(
		parseSync(schema, 0n),
		Err(
			ParseError(
				TooSmall({
					input: 0n,
					origin: "bigint",
					minimum: 0n,
					inclusive: false,
				}),
			),
		),
	);
	assertEquals(
		parseSync(schema, top + 1n),
		Err(
			ParseError(
				TooBig({
					input: top + 1n,
					origin: "bigint",
					maximum: top,
					inclusive: true,
				}),
			),
		),
	);
});

Deno.test("bigint's multipleOf checks divisibility, after the bounds", () => {
	// Given: a non-negative multiple of 3
	const schema = bigint({ min: 0n, multipleOf: 3n });

	// When: parsing a multiple, a non-multiple and a value failing both checks
	// Then: the multiple passes, and the bound is reported before divisibility
	assertEquals(parseSync(schema, 9n), Ok(9n));
	assertEquals(
		parseSync(schema, 10n),
		Err(
			ParseError(NotMultipleOf({ input: 10n, origin: "bigint", divisor: 3n })),
		),
	);
	assertEquals(
		parseSync(schema, -1n),
		Err(
			ParseError(
				TooSmall({
					input: -1n,
					origin: "bigint",
					minimum: 0n,
					inclusive: true,
				}),
			),
		),
	);
});

Deno.test("bigint's multipleOf panics on a divisor that is not positive", () => {
	for (const divisor of [0n, -2n]) {
		// Given: an invalid divisor
		// When: building the schema
		// Then: it panics with a RangeError
		assertThrows(() => bigint({ multipleOf: divisor }), RangeError);
	}
});

Deno.test("bigint accepts bigints", () => {
	for (const input of [0n, -1n, 2n ** 64n]) {
		// Given: a bigint schema
		const schema = bigint();

		// When: parsing a bigint
		const result = parseSync(schema, input);

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input));
	}
});

Deno.test("bigint rejects every other value with InvalidType", () => {
	for (const input of [1, "1", null, undefined, true]) {
		// Given: a bigint schema
		const schema = bigint();

		// When: parsing a value of another type
		const result = parseSync(schema, input);

		// Then: it fails expecting bigint
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "bigint" }))),
		);
	}
});
