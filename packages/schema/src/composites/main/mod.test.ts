import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Schema } from "@/src/core/main/mod.ts";
import { UnknownKey } from "@/src/core/mini/issue.ts";
import { entries } from "@/src/core/mini/issues.ts";
import { parseAsync, parseSync } from "@/src/core/mini/schema.ts";
import { array, ObjectSchema, object, optional } from "./mod.ts";

const text = new Schema((input: unknown) =>
	typeof input === "string" ? Ok(input) : Err("not text"),
);

Deno.test("object returns a main ObjectSchema whose unknown-key methods chain", async () => {
	// Given: a main object schema made strict, then loose, then strict again
	const user = object({ name: text }).passthrough().strict();

	// When: parsing an object with an extra key
	const issues = unwrapErr(
		await parseAsync(user, { name: "Ada", admin: true }),
	);

	// Then: the chain returned main ObjectSchemas and the last policy won
	assertInstanceOf(user, ObjectSchema);
	assertEquals(entries(issues), [
		{ path: ["admin"], error: UnknownKey({ key: "admin", input: true }) },
	]);
});

Deno.test("composites return main Schemas, so core methods chain", () => {
	// Given: an array of optional text, mapped to its length
	const lengths = array(optional(text)).map((items) => items.length);

	// When: parsing with the chained method
	const parsed = unwrap(lengths.parseSync(["a", undefined]));

	// Then: the main Schema's methods ran
	assertInstanceOf(lengths, Schema);
	assertEquals(parsed, 2);
});

Deno.test("a main ObjectSchema parses with the mini functions", () => {
	// Given: a main object schema
	const user = object({ name: text }).strip();

	// When: parsing it with mini parseSync
	const parsed = unwrap(parseSync(user, { name: "Ada", admin: true }));

	// Then: it is a mini Schema too
	assertEquals(parsed, { name: "Ada" });
});
