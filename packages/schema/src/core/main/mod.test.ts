import { Result } from "@sekhmet/enum/result";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Schema } from "./mod.ts";

const digits = new Schema((input: string) =>
	/^\d+$/.test(input) ? Ok(Number(input)) : Err("not digits"),
);

Deno.test("parseSync returns enum's main Result, so its methods chain", () => {
	// Given: a schema that accepts digit strings
	// When: parsing a valid and an invalid input and chaining Result methods
	const parsed = digits.parseSync("21");
	const doubled = parsed.map((n) => n * 2).unwrapOr(0);
	const fallback = digits
		.parseSync("abc")
		.map((n) => n * 2)
		.unwrapOr(0);

	// Then: the result is a main Result and each chain ran to its end
	assertInstanceOf(parsed, Result);
	assertEquals(doubled, 42);
	assertEquals(fallback, 0);
});
