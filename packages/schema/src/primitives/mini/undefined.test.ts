import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { undefined_ } from "./undefined.ts";

Deno.test("undefined_ accepts only undefined", () => {
	for (const input of [undefined]) {
		// Given: a undefined_ schema
		const schema = undefined_();

		// When: parsing undefined
		const result = parseSync(schema, input);

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input), Deno.inspect(input));
	}
});

Deno.test("undefined_ rejects every other value with InvalidType", () => {
	for (const input of [null, 0, "", false, {}]) {
		// Given: a undefined_ schema
		const schema = undefined_();

		// When: parsing a value of another type
		const result = parseSync(schema, input);

		// Then: it fails expecting undefined
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "undefined" }))),
			Deno.inspect(input),
		);
	}
});
