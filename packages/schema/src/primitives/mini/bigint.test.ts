import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { bigint } from "./bigint.ts";

Deno.test("bigint accepts bigints", () => {
	for (const input of [0n, -1n, 2n ** 64n]) {
		// Given: a bigint schema
		const schema = bigint();

		// When: parsing a bigint
		const result = parseSync(schema, input);

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input), Deno.inspect(input));
	}
});

Deno.test("bigint rejects every other value with InvalidType", () => {
	for (const input of [1, "1", null, undefined, true]) {
		// Given: a bigint schema
		const schema = bigint();

		// When: parsing a value of another type
		const result = parseSync(schema, input);

		// Then: it fails expecting bigint
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "bigint" }))),
			Deno.inspect(input),
		);
	}
});
