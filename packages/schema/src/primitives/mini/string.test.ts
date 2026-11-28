import { match } from "@sekhmet/enum/core/mini/exit";
import { Err } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { string } from "./string.ts";

const panics = definePanicRuntime();

Deno.test("string accepts string values", () => {
	// Given: a string schema
	const schema = string();

	// When: parsing a string
	const result = parseSync(schema, { input: "hello", panics });

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
	const result = parseSync(schema, { input: 123, panics });

	// Then: it fails with an InvalidType issue
	assertEquals(
		result,
		Err(ParseError(InvalidType({ input: 123, expected: "string" }))),
	);
});

Deno.test("string coerces non-string values when coerce is true", () => {
	// Given: a string schema with coerce enabled
	const schema = string({ coerce: true });

	// When: parsing a number
	const result = parseSync(schema, { input: 123, panics });

	// Then: it should coerce to string
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => null,
		}),
		"123",
	);
});
