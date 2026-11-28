import { Err } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidType } from "@/src/core/mini/issue.ts";
import { type Output, ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { never } from "./never.ts";

const panics = definePanicRuntime();

Deno.test("never rejects every value with InvalidType", () => {
	for (const input of [undefined, null, 0, "", {}, []]) {
		// Given: a never schema
		const schema = never();

		// When: parsing any value
		const result = parseSync(schema, { input: input, panics });

		// Then: it fails expecting never
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "never" }))),
		);
	}
});

Deno.test("never's output type is never", () => {
	// Given: a never schema
	const schema = never();

	// When: reading its output type
	// Then: it is never
	assertType<IsExact<Output<typeof schema>, never>>(true);
});
