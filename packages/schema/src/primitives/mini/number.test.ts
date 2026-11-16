import { match } from "@sekhmet/enum/core/mini/exit";
import { Err } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { number } from "./number.ts";

Deno.test("number accepts numeric values", () => {
	// Given: a number schema
	const schema = number();

	// When: parsing a number
	const result = parseSync(schema, 42);

	// Then: it should succeed
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		42,
	);
});

Deno.test("number rejects non-numeric values by default", () => {
	// Given: a number schema
	const schema = number();

	// When: parsing a non-number
	const result = parseSync(schema, "123");

	// Then: it fails with an InvalidType issue
	assertEquals(
		result,
		Err(ParseError(InvalidType({ input: "123", expected: "number" }))),
	);
});

Deno.test("number coerces non-numeric values when coerce is true", () => {
	// Given: a number schema with coerce enabled
	const schema = number({ coerce: true });

	// When: parsing a string
	const result = parseSync(schema, "123");

	// Then: it should coerce to number
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		123,
	);
});
