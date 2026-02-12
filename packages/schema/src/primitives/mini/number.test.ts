import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini/exit";
import { parseSync } from "@/src/core/mini/schema.ts";
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

	// Then: it should fail with a TypeError
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => false,
			ParseError: (e) => e instanceof TypeError,
		}),
		true,
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
