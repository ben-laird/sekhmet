import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { formatIssue, InvalidType } from "@/src/core/mini/issue.ts";
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
