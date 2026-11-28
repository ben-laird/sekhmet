import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals, assertThrows } from "@std/assert";
import {
	InvalidType,
	NotMultipleOf,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import {
	ParseError,
	type ParseSyncError,
	parseSync,
	type Schema,
} from "@/src/core/mini/schema.ts";
import { number } from "./number.ts";

const panics = definePanicRuntime();

type Parsed = Result<number, ParseSyncError<SchemaIssue>>;

function failed(issue: SchemaIssue): Parsed {
	return Err(ParseError(issue));
}

/** Parses every input with `schema`, pairing each with its expected result. */
function assertParses({
	schema,
	cases,
}: {
	schema: Schema<unknown, number, SchemaIssue>;
	cases: readonly [input: unknown, expected: Parsed][];
}): void {
	for (const [input, expected] of cases) {
		assertEquals(
			parseSync(schema, { input: input, panics }),
			expected,
			String(input),
		);
	}
}

Deno.test("int accepts integers and rejects fractions", () => {
	// Given: an integer schema
	const schema = number({ int: true });

	// When: parsing integers and a fraction
	// Then: integers pass and the fraction fails expecting an integer
	assertParses({
		schema,
		cases: [
			[3, Ok(3)],
			[-0, Ok(-0)],
			[1e21, Ok(1e21)],
			[3.5, failed(InvalidType({ input: 3.5, expected: "integer" }))],
		],
	});
});

Deno.test("safe accepts only integers a number represents exactly", () => {
	// Given: a safe-integer schema
	const schema = number({ safe: true });
	const above = Number.MAX_SAFE_INTEGER + 1;
	const below = Number.MIN_SAFE_INTEGER - 1;

	// When: parsing values at and beyond the safe range, and a fraction
	// Then: the range's ends pass and everything else fails with its issue
	assertParses({
		schema,
		cases: [
			[Number.MAX_SAFE_INTEGER, Ok(Number.MAX_SAFE_INTEGER)],
			[Number.MIN_SAFE_INTEGER, Ok(Number.MIN_SAFE_INTEGER)],
			[
				above,
				failed(
					TooBig({
						input: above,
						origin: "number",
						maximum: Number.MAX_SAFE_INTEGER,
						inclusive: true,
					}),
				),
			],
			[
				below,
				failed(
					TooSmall({
						input: below,
						origin: "number",
						minimum: Number.MIN_SAFE_INTEGER,
						inclusive: true,
					}),
				),
			],
			[0.5, failed(InvalidType({ input: 0.5, expected: "integer" }))],
		],
	});
});

Deno.test("multipleOf compares decimals at their written precision", () => {
	// Given: schemas checking multiples of an integer and of a decimal
	const even = number({ multipleOf: 2 });
	const cents = number({ multipleOf: 0.01 });

	// When: parsing multiples and non-multiples
	// Then: multiples pass, despite floating point, and others fail
	assertParses({
		schema: even,
		cases: [
			[4, Ok(4)],
			[-6, Ok(-6)],
			[0, Ok(0)],
			[3, failed(NotMultipleOf({ input: 3, origin: "number", divisor: 2 }))],
		],
	});
	assertParses({
		schema: cents,
		cases: [
			[0.3, Ok(0.3)],
			[19.99, Ok(19.99)],
			[
				19.999,
				failed(
					NotMultipleOf({ input: 19.999, origin: "number", divisor: 0.01 }),
				),
			],
		],
	});
	assertParses({
		schema: number({ multipleOf: 0.1 }),
		cases: [[0.3, Ok(0.3)]],
	});
});

Deno.test("multipleOf panics on a divisor that is not positive and finite", () => {
	for (const divisor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		// Given: an invalid divisor
		// When: building the schema
		// Then: it panics with a RangeError
		assertThrows(() => number({ multipleOf: divisor }), RangeError);
	}
});

Deno.test("a bare min or max is inclusive", () => {
	// Given: schemas bounded inclusively to [0, 10]
	const atLeast = number({ min: 0 });
	const atMost = number({ max: 10 });

	// When: parsing the bounds and values beyond them
	// Then: the bounds pass and the values beyond fail
	assertParses({
		schema: atLeast,
		cases: [
			[0, Ok(0)],
			[
				-1,
				failed(
					TooSmall({
						input: -1,
						origin: "number",
						minimum: 0,
						inclusive: true,
					}),
				),
			],
		],
	});
	assertParses({
		schema: atMost,
		cases: [
			[10, Ok(10)],
			[
				11,
				failed(
					TooBig({ input: 11, origin: "number", maximum: 10, inclusive: true }),
				),
			],
		],
	});
});

Deno.test("min and max with inclusive: false reject the bound itself", () => {
	// Given: schemas bounded exclusively to (0, 10)
	const above = number({ min: { value: 0, inclusive: false } });
	const below = number({ max: { value: 10, inclusive: false } });

	// When: parsing the bounds and a value inside
	// Then: the bounds fail and the value inside passes
	assertParses({
		schema: above,
		cases: [
			[0.1, Ok(0.1)],
			[
				0,
				failed(
					TooSmall({
						input: 0,
						origin: "number",
						minimum: 0,
						inclusive: false,
					}),
				),
			],
		],
	});
	assertParses({
		schema: below,
		cases: [
			[9.9, Ok(9.9)],
			[
				10,
				failed(
					TooBig({
						input: 10,
						origin: "number",
						maximum: 10,
						inclusive: false,
					}),
				),
			],
		],
	});
});

Deno.test("{ value, inclusive: true } is the same as a bare bound", () => {
	// Given: the same range written both ways
	const bare = number({ min: 0, max: 10 });
	const spelled = number({
		min: { value: 0, inclusive: true },
		max: { value: 10, inclusive: true },
	});

	for (const input of [-1, 0, 5, 10, 11]) {
		// When: parsing a value with each
		// Then: both give the same result
		assertEquals(
			parseSync(spelled, { input: input, panics }),
			parseSync(bare, { input: input, panics }),
		);
	}
});

Deno.test("checks report the first failure in their documented order", () => {
	// Given: a multiple of 2 that is a positive integer up to 100
	const schema = number({ min: 1, max: 100, int: true, multipleOf: 2 });

	// When: parsing a valid value, a non-number and values failing several checks
	// Then: int comes before min and max, which come before multipleOf
	assertEquals(parseSync(schema, { input: 50, panics }), Ok(50));
	assertParses({
		schema,
		cases: [
			["50", failed(InvalidType({ input: "50", expected: "number" }))],
			[
				Number.NaN,
				failed(InvalidType({ input: Number.NaN, expected: "number" })),
			],
			[0.5, failed(InvalidType({ input: 0.5, expected: "integer" }))],
			[
				-1,
				failed(
					TooSmall({
						input: -1,
						origin: "number",
						minimum: 1,
						inclusive: true,
					}),
				),
			],
			[
				101,
				failed(
					TooBig({
						input: 101,
						origin: "number",
						maximum: 100,
						inclusive: true,
					}),
				),
			],
			[3, failed(NotMultipleOf({ input: 3, origin: "number", divisor: 2 }))],
		],
	});
});

Deno.test("an allowed NaN is accepted without any other check", () => {
	for (const options of [
		{ min: 0 },
		{ max: 0 },
		{ int: true },
		{ safe: true },
		{ multipleOf: 2 },
		{ min: 0, max: 1, int: true, safe: true, multipleOf: 2 },
	]) {
		// Given: a schema allowing NaN, with a check NaN can't meet
		const schema = number({ nan: true, ...options });

		// When: parsing NaN
		const result = parseSync(schema, { input: Number.NaN, panics });

		// Then: allowed means accepted, so NaN passes
		assertEquals(result, Ok(Number.NaN), JSON.stringify(options));
	}
});

Deno.test("an allowed ±Infinity meets min and max, but no other check", async (t) => {
	await t.step("min and max compare it", () => {
		// Given: schemas allowing ±Infinity, bounded below and above
		const atLeast = number({ infinite: true, min: 0 });
		const atMost = number({ infinite: true, max: 10 });
		const inf = Number.POSITIVE_INFINITY;
		const negInf = Number.NEGATIVE_INFINITY;

		// When: parsing each infinity against each bound
		// Then: Infinity passes min and fails max, -Infinity the reverse
		assertParses({
			schema: atLeast,
			cases: [
				[inf, Ok(inf)],
				[
					negInf,
					failed(
						TooSmall({
							input: negInf,
							origin: "number",
							minimum: 0,
							inclusive: true,
						}),
					),
				],
			],
		});
		assertParses({
			schema: atMost,
			cases: [
				[negInf, Ok(negInf)],
				[
					inf,
					failed(
						TooBig({
							input: inf,
							origin: "number",
							maximum: 10,
							inclusive: true,
						}),
					),
				],
			],
		});
	});

	await t.step("int, safe and multipleOf are skipped", () => {
		for (const options of [{ int: true }, { safe: true }, { multipleOf: 2 }]) {
			// Given: a schema allowing ±Infinity, with an integer-only check
			const schema = number({ infinite: true, ...options });

			// When: parsing both infinities
			// Then: they pass, since the check means nothing for them
			assertParses({
				schema,
				cases: [
					[Number.POSITIVE_INFINITY, Ok(Number.POSITIVE_INFINITY)],
					[Number.NEGATIVE_INFINITY, Ok(Number.NEGATIVE_INFINITY)],
				],
			});
		}
	});
});

Deno.test("without nan or infinite, NaN and ±Infinity fail before any check", () => {
	// Given: a schema with every check but neither nan nor infinite
	const schema = number({ min: 0, int: true, multipleOf: 2 });

	// When: parsing NaN and the infinities
	// Then: each fails as the wrong type, not a failed check
	assertParses({
		schema,
		cases: [
			[
				Number.NaN,
				failed(InvalidType({ input: Number.NaN, expected: "number" })),
			],
			[
				Number.POSITIVE_INFINITY,
				failed(
					InvalidType({ input: Number.POSITIVE_INFINITY, expected: "number" }),
				),
			],
		],
	});
});

Deno.test("allowing NaN or ±Infinity leaves finite numbers fully checked", () => {
	// Given: a schema allowing both, with every check
	const schema = number({ nan: true, infinite: true, int: true, min: 0 });

	// When: parsing finite values failing a check
	// Then: the checks still apply to them
	assertParses({
		schema,
		cases: [
			[2, Ok(2)],
			[1.5, failed(InvalidType({ input: 1.5, expected: "integer" }))],
			[
				-1,
				failed(
					TooSmall({
						input: -1,
						origin: "number",
						minimum: 0,
						inclusive: true,
					}),
				),
			],
		],
	});
});

Deno.test("checks run on the coerced number", () => {
	// Given: a coercing number schema checked to be at least 3
	const schema = number({ coerce: true, min: 3 });

	// When: parsing a numeric string whose number is too small
	const result = parseSync(schema, { input: " 2 ", panics });

	// Then: the check reports the converted value
	assertEquals(
		result,
		failed(
			TooSmall({ input: 2, origin: "number", minimum: 3, inclusive: true }),
		),
	);
});
