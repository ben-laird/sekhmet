import { Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { type ErrorOf, parseSync } from "@/src/core/mini/schema.ts";
import { unknown } from "./unknown.ts";

const panics = definePanicRuntime();

Deno.test("unknown accepts every value unchanged", () => {
	for (const input of [undefined, null, 0, "", Number.NaN, {}, [], Symbol()]) {
		// Given: an unknown schema
		const schema = unknown();

		// When: parsing any value
		const result = parseSync(schema, { input: input, panics });

		// Then: it is accepted as is
		assertEquals(result, Ok(input));
	}
});

Deno.test("unknown never fails, so its error type is never", () => {
	// Given: an unknown schema
	const schema = unknown();

	// When: reading its error type
	// Then: it is never
	assertType<IsExact<ErrorOf<typeof schema>, never>>(true);
});
