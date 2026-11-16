import { match } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertExists } from "@std/assert";
import { parseSync } from "@/src/core/mini/schema.ts";
import { string } from "./string.ts";

Deno.test("string accepts string values", () => {
	// Given: a string schema
	const schema = string();

	// When: parsing a string
	const result = parseSync(schema, "hello");

	// Then: it should succeed
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		"hello",
	);
});

Deno.test("string rejects non-string values by default", () => {
	// Given: a string schema
	const schema = string();

	// When: parsing a non-string
	const result = parseSync(schema, 123);

	// Then: it should fail with a TypeError
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => false,
			ParseError: (e) => e instanceof TypeError,
		}),
		true,
	);
});

Deno.test("string coerces non-string values when coerce is true", () => {
	// Given: a string schema with coerce enabled
	const schema = string({ coerce: true });

	// When: parsing a number
	const result = parseSync(schema, 123);

	// Then: it should coerce to string
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		"123",
	);
});
