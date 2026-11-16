import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { matrix } from "@sekhmet/matrix";
import { assertEquals } from "@std/assert";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import {
	ParseError,
	type ParseSyncError,
	parseSync,
} from "@/src/core/mini/schema.ts";
import { type NumberSchemaOptions, number, type Range } from "./number.ts";

/** The result `parseSync` gives for a schema failing with `issue`. */
function failed(issue: SchemaIssue) {
	return Err(ParseError(issue));
}

Deno.test("number accepts finite numbers, -0 included", () => {
	for (const input of [0, -0, 42, -1.5, Number.MAX_VALUE]) {
		// Given: a default number schema
		const schema = number();

		// When: parsing a finite number
		const result = parseSync(schema, input);

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input), String(input));
	}
});

Deno.test("number rejects non-numbers by default", () => {
	for (const input of ["123", null, undefined, true, 1n, {}, []]) {
		// Given: a default number schema
		const schema = number();

		// When: parsing a value of another type
		const result = parseSync(schema, input);

		// Then: it fails with an InvalidType issue
		assertEquals(
			result,
			failed(InvalidType({ input, expected: "number" })),
			String(input),
		);
	}
});

for (const { input, nan, infinite } of matrix({
	input: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
	nan: [false, true],
	infinite: [false, true],
})) {
	Deno.test(`number({ nan: ${nan}, infinite: ${infinite} }) on ${input}`, () => {
		// Given: a number schema with the non-finite options set
		const schema = number({ nan, infinite });

		// When: parsing a non-finite number
		const result = parseSync(schema, input);

		// Then: it is accepted only when its option allows it
		const allowed = Number.isNaN(input) ? nan : infinite;
		assertEquals(
			result,
			allowed ? Ok(input) : failed(InvalidType({ input, expected: "number" })),
		);
	});
}

Deno.test("number honours its range, with each bound's inclusivity", () => {
	// Given: a range [0, 10) and the expected result per input
	const range: Range = { min: [0, "inclusive"], max: [10, "non-inclusive"] };
	const options: NumberSchemaOptions = { range };
	const cases: [number, Result<number, ParseSyncError<SchemaIssue>>][] = [
		[0, Ok(0)],
		[9.5, Ok(9.5)],
		[
			-1,
			failed(
				TooSmall({ input: -1, origin: "number", minimum: 0, inclusive: true }),
			),
		],
		[
			10,
			failed(
				TooBig({ input: 10, origin: "number", maximum: 10, inclusive: false }),
			),
		],
	];

	for (const [input, expected] of cases) {
		// When: parsing a value against the range
		const result = parseSync(number(options), input);

		// Then: it is accepted inside the range and rejected outside it
		assertEquals(result, expected, String(input));
	}
});

Deno.test("number's range excludes exclusive minimums and allows inclusive maximums", () => {
	// Given: a range (0, 10]
	const schema = number({
		range: { min: [0, "non-inclusive"], max: [10, "inclusive"] },
	});

	// When: parsing each bound
	const atMin = parseSync(schema, 0);
	const atMax = parseSync(schema, 10);

	// Then: the exclusive minimum fails and the inclusive maximum passes
	assertEquals(
		atMin,
		failed(
			TooSmall({ input: 0, origin: "number", minimum: 0, inclusive: false }),
		),
	);
	assertEquals(atMax, Ok(10));
});

Deno.test("number coerces non-numeric values when coerce is true", () => {
	// Given: a number schema with coerce enabled
	const schema = number({ coerce: true });

	// When: parsing a numeric string
	const result = parseSync(schema, "123");

	// Then: it is coerced to a number
	assertEquals(result, Ok(123));
});
