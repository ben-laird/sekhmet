import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { assertEquals, assertThrows } from "@std/assert";
import {
	InvalidType,
	NotMultipleOf,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import {
	map,
	ParseError,
	type ParseSyncError,
	parseSync,
	type Schema,
} from "@/src/core/mini/schema.ts";
import { number } from "./number.ts";
import { int, max, min, multipleOf, safe } from "./number-checks.ts";

type Parsed = Result<number, ParseSyncError<SchemaIssue>>;

function failed(issue: SchemaIssue): Parsed {
	return Err(ParseError(issue));
}

/** Parses every input with `schema`, pairing each with its expected result. */
function assertParses(
	schema: Schema<unknown, number, SchemaIssue>,
	cases: readonly [input: number, expected: Parsed][],
): void {
	for (const [input, expected] of cases) {
		assertEquals(parseSync(schema, input), expected, String(input));
	}
}

Deno.test("int accepts integers and rejects fractions", () => {
	// Given: an integer schema
	const schema = int(number());

	// When: parsing integers and a fraction
	// Then: integers pass and the fraction fails expecting an integer
	assertParses(schema, [
		[3, Ok(3)],
		[-0, Ok(-0)],
		[1e21, Ok(1e21)],
		[3.5, failed(InvalidType({ input: 3.5, expected: "integer" }))],
	]);
});

Deno.test("safe accepts only integers a number represents exactly", () => {
	// Given: a safe-integer schema
	const schema = safe(number());
	const above = Number.MAX_SAFE_INTEGER + 1;
	const below = Number.MIN_SAFE_INTEGER - 1;

	// When: parsing values at and beyond the safe range, and a fraction
	// Then: the range's ends pass and everything else fails with its issue
	assertParses(schema, [
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
	]);
});

Deno.test("multipleOf compares decimals at their written precision", () => {
	// Given: schemas checking multiples of an integer and of a decimal
	const even = multipleOf(number(), 2);
	const cents = multipleOf(number(), 0.01);

	// When: parsing multiples and non-multiples
	// Then: multiples pass, despite floating point, and others fail
	assertParses(even, [
		[4, Ok(4)],
		[-6, Ok(-6)],
		[0, Ok(0)],
		[3, failed(NotMultipleOf({ input: 3, origin: "number", divisor: 2 }))],
	]);
	assertParses(cents, [
		[0.3, Ok(0.3)],
		[19.99, Ok(19.99)],
		[
			19.999,
			failed(NotMultipleOf({ input: 19.999, origin: "number", divisor: 0.01 })),
		],
	]);
	assertParses(multipleOf(number(), 0.1), [[0.3, Ok(0.3)]]);
});

Deno.test("multipleOf panics on a divisor that is not positive and finite", () => {
	for (const divisor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		// Given: an invalid divisor
		// When: building the check
		// Then: it panics with a RangeError
		assertThrows(() => multipleOf(number(), divisor), RangeError);
	}
});

Deno.test("min and max are inclusive by default", () => {
	// Given: schemas bounded inclusively to [0, 10]
	const atLeast = min(number(), 0);
	const atMost = max(number(), 10);

	// When: parsing the bounds and values beyond them
	// Then: the bounds pass and the values beyond fail
	assertParses(atLeast, [
		[0, Ok(0)],
		[
			-1,
			failed(
				TooSmall({ input: -1, origin: "number", minimum: 0, inclusive: true }),
			),
		],
	]);
	assertParses(atMost, [
		[10, Ok(10)],
		[
			11,
			failed(
				TooBig({ input: 11, origin: "number", maximum: 10, inclusive: true }),
			),
		],
	]);
});

Deno.test("min and max with inclusive: false reject the bound itself", () => {
	// Given: schemas bounded exclusively to (0, 10)
	const above = min(number(), 0, { inclusive: false });
	const below = max(number(), 10, { inclusive: false });

	// When: parsing the bounds and a value inside
	// Then: the bounds fail and the value inside passes
	assertParses(above, [
		[0.1, Ok(0.1)],
		[
			0,
			failed(
				TooSmall({ input: 0, origin: "number", minimum: 0, inclusive: false }),
			),
		],
	]);
	assertParses(below, [
		[9.9, Ok(9.9)],
		[
			10,
			failed(
				TooBig({ input: 10, origin: "number", maximum: 10, inclusive: false }),
			),
		],
	]);
});

Deno.test("checks compose and pass an earlier failure through", () => {
	// Given: a positive integer up to 100
	const schema = max(int(min(number(), 1)), 100);

	// When: parsing a valid value, a non-number and a value failing each check
	// Then: the first failing check's issue is reported
	assertEquals(parseSync(schema, 50), Ok(50));
	assertEquals(
		parseSync(schema, "50"),
		failed(InvalidType({ input: "50", expected: "number" })),
	);
	assertParses(schema, [
		[
			0,
			failed(
				TooSmall({ input: 0, origin: "number", minimum: 1, inclusive: true }),
			),
		],
		[1.5, failed(InvalidType({ input: 1.5, expected: "integer" }))],
		[
			101,
			failed(
				TooBig({ input: 101, origin: "number", maximum: 100, inclusive: true }),
			),
		],
	]);
});

Deno.test("checks apply to any schema whose output is a number", () => {
	// Given: a number schema mapped to its double, checked to be at least 3
	const doubled = min(
		map(number(), (n) => n * 2),
		3,
	);

	// When: parsing a value whose mapped output is too small
	const result = parseSync(doubled, 1);

	// Then: the check runs on the mapped output
	assertEquals(
		result,
		failed(
			TooSmall({ input: 2, origin: "number", minimum: 3, inclusive: true }),
		),
	);
});
