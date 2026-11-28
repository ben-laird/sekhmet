import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { matrix } from "@sekhmet/matrix";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	ParseError,
	type ParseSyncError,
	parseSync,
} from "@/src/core/mini/schema.ts";
import { type NumberSchemaOptions, number } from "./number.ts";

const panics = definePanicRuntime();

/** The result `parseSync` gives for a schema failing with `issue`. */
function failed(issue: SchemaIssue) {
	return Err(ParseError(issue));
}

Deno.test("number accepts finite numbers, -0 included", () => {
	for (const input of [0, -0, 42, -1.5, Number.MAX_VALUE]) {
		// Given: a default number schema
		const schema = number();

		// When: parsing a finite number
		const result = parseSync(schema, { input: input, panics });

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input), String(input));
	}
});

Deno.test("number rejects non-numbers by default", () => {
	for (const input of ["123", null, undefined, true, 1n, {}, []]) {
		// Given: a default number schema
		const schema = number();

		// When: parsing a value of another type
		const result = parseSync(schema, { input: input, panics });

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
		const result = parseSync(schema, { input: input, panics });

		// Then: it is accepted only when its option allows it
		const allowed = Number.isNaN(input) ? nan : infinite;
		assertEquals(
			result,
			allowed ? Ok(input) : failed(InvalidType({ input, expected: "number" })),
		);
	});
}

Deno.test("number's options don't change its types", () => {
	// Given: a number schema with checks and coercion
	const schema = number({ coerce: true, int: true, min: 0 });

	// When: reading its types
	// Then: it takes anything, gives a number and fails with a SchemaIssue
	assertType<IsExact<Input<typeof schema>, unknown>>(true);
	assertType<IsExact<Output<typeof schema>, number>>(true);
	assertType<IsExact<ErrorOf<typeof schema>, SchemaIssue>>(true);
});

Deno.test("number honours min and max, with each bound's inclusivity", () => {
	// Given: a range [0, 10) and the expected result per input
	const options: NumberSchemaOptions = {
		min: 0,
		max: { value: 10, inclusive: false },
	};
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
		const result = parseSync(number(options), { input: input, panics });

		// Then: it is accepted inside the range and rejected outside it
		assertEquals(result, expected, String(input));
	}
});

Deno.test("number excludes an exclusive minimum and allows an inclusive maximum", () => {
	// Given: a range (0, 10]
	const schema = number({ min: { value: 0, inclusive: false }, max: 10 });

	// When: parsing each bound
	const atMin = parseSync(schema, { input: 0, panics });
	const atMax = parseSync(schema, { input: 10, panics });

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
	const result = parseSync(schema, { input: "123", panics });

	// Then: it is coerced to a number
	assertEquals(result, Ok(123));
});
