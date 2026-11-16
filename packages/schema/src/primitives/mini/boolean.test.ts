import { match } from "@sekhmet/enum/core/mini/exit";
import { assertEquals, assertExists } from "@std/assert";
import { parseSync } from "@/src/core/mini/schema.ts";
import { boolean } from "./boolean.ts";

Deno.test("boolean accepts boolean values", () => {
	// Given: a boolean schema
	const schema = boolean();

	// When: parsing a boolean
	const result = parseSync(schema, true);

	// Then: it should succeed
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		true,
	);
});

Deno.test("boolean rejects non-boolean values by default", () => {
	// Given: a boolean schema
	const schema = boolean();

	// When: parsing a non-boolean
	const result = parseSync(schema, "true");

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

Deno.test("boolean coerces non-boolean values when coerce is true", () => {
	// Given: a boolean schema with coerce enabled
	const schema = boolean({ coerce: true });

	// When: parsing a number
	const result = parseSync(schema, 1);

	// Then: it should coerce to boolean
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		true,
	);
});

Deno.test("boolean coerces falsy values to false", () => {
	// Given: a boolean schema with coerce enabled
	const schema = boolean({ coerce: true });

	// When: parsing a falsy value
	const result = parseSync(schema, 0);

	// Then: it should coerce to false
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		false,
	);
});
