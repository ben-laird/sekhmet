import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { symbol } from "./symbol.ts";

const panics = definePanicRuntime();

Deno.test("symbol accepts symbols", () => {
	for (const input of [Symbol("id"), Symbol.iterator]) {
		// Given: a symbol schema
		const schema = symbol();

		// When: parsing a symbol
		const result = parseSync(schema, { input: input, panics });

		// Then: it is accepted unchanged
		assertEquals(result, Ok(input));
	}
});

Deno.test("symbol rejects every other value with InvalidType", () => {
	for (const input of ["id", 1, null, undefined, {}]) {
		// Given: a symbol schema
		const schema = symbol();

		// When: parsing a value of another type
		const result = parseSync(schema, { input: input, panics });

		// Then: it fails expecting symbol
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "symbol" }))),
		);
	}
});
