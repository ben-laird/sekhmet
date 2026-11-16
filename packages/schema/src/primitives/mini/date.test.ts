import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import {
	formatIssue,
	InvalidType,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { date } from "./date.ts";

Deno.test("date accepts a valid Date and returns the same instance", () => {
	// Given: a date schema and a valid Date
	const input = new Date("2026-11-16T00:00:00Z");

	// When: parsing it
	const result = parseSync(date(), input);

	// Then: it is accepted, not copied
	assertEquals(result, Ok(input));
	assertStrictEquals(unwrap(result), input);
});

Deno.test("date rejects an Invalid Date, naming it as received", () => {
	// Given: a Date whose time is NaN
	const input = new Date(Number.NaN);

	// When: parsing it
	const result = parseSync(date(), input);

	// Then: it fails with InvalidType, received "invalid date"
	const issue = InvalidType({ input, expected: "date" });
	assertEquals(result, Err(ParseError(issue)));
	assertEquals(formatIssue(issue), "Expected date, received invalid date");
});

Deno.test("date does not coerce strings or timestamps", () => {
	for (const input of ["2026-11-16", 0, null, undefined, {}]) {
		// Given: a value that only describes a date
		// When: parsing it
		const result = parseSync(date(), input);

		// Then: it fails with InvalidType
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "date" }))),
			Deno.inspect(input),
		);
	}
});

Deno.test("date's min and max compare times, with each bound's inclusivity", () => {
	// Given: dates in [2000-01-01, 2100-01-01)
	const start = new Date("2000-01-01T00:00:00Z");
	const end = new Date("2100-01-01T00:00:00Z");
	const schema = date({ min: start, max: { value: end, inclusive: false } });
	const before = new Date("1999-12-31T23:59:59Z");

	// When: parsing the bounds, a copy of the start, and a date before it
	// Then: the inclusive start passes, by time, and the exclusive end fails
	assertEquals(
		parseSync(schema, new Date(start.getTime())),
		Ok(new Date(start)),
	);
	assertEquals(
		parseSync(schema, before),
		Err(
			ParseError(
				TooSmall({
					input: before,
					origin: "date",
					minimum: start,
					inclusive: true,
				}),
			),
		),
	);
	assertEquals(
		parseSync(schema, end),
		Err(
			ParseError(
				TooBig({ input: end, origin: "date", maximum: end, inclusive: false }),
			),
		),
	);
});
