import { match } from "@sekhmet/enum/core/mini/exit";
import { Err } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { boolean } from "./boolean.ts";

const panics = definePanicRuntime();

Deno.test("boolean accepts boolean values", () => {
	// Given: a boolean schema
	const schema = boolean();

	// When: parsing a boolean
	const result = parseSync(schema, { input: true, panics });

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
	const result = parseSync(schema, { input: "true", panics });

	// Then: it fails with an InvalidType issue
	assertEquals(
		result,
		Err(ParseError(InvalidType({ input: "true", expected: "boolean" }))),
	);
});

Deno.test("boolean coerces non-boolean values when coerce is true", () => {
	// Given: a boolean schema with coerce enabled
	const schema = boolean({ coerce: true });

	// When: parsing a number
	const result = parseSync(schema, { input: 1, panics });

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
	const result = parseSync(schema, { input: 0, panics });

	// Then: it should coerce to false
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		false,
	);
});
