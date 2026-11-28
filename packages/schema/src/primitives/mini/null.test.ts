import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { null_ } from "./null.ts";

const panics = definePanicRuntime();

Deno.test("null_ accepts only null", () => {
	for (const input of [null]) {
		// Given: a null_ schema
		const schema = null_();

		// When: parsing null
		const result = parseSync(schema, { input: input, panics });

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input));
	}
});

Deno.test("null_ rejects every other value with InvalidType", () => {
	for (const input of [undefined, 0, "", false, Number.NaN, {}]) {
		// Given: a null_ schema
		const schema = null_();

		// When: parsing a value of another type
		const result = parseSync(schema, { input: input, panics });

		// Then: it fails expecting null
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "null" }))),
		);
	}
});
