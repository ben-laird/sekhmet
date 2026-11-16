import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Schema } from "@/src/core/main/mod.ts";
import { UnknownKey } from "@/src/core/mini/issue.ts";
import { entries } from "@/src/core/mini/issues.ts";
import { parseSync } from "@/src/core/mini/schema.ts";
import { array, object, optional } from "./mod.ts";

const text = new Schema((input: unknown) =>
	typeof input === "string" ? Ok(input) : Err("not text"),
);

Deno.test("object returns a main Schema, so core methods chain", async () => {
	// Given: a strict main object schema
	const user = object({ shape: { name: text }, unknownKeys: "strict" });

	// When: parsing an object with an extra key through the chained method
	const found = unwrapErr(await user.parseAsync({ name: "Ada", admin: true }));

	// Then: object returned a main Schema that honours its unknownKeys
	assertInstanceOf(user, Schema);
	assertEquals(entries(found), [
		{ path: ["admin"], error: UnknownKey({ key: "admin", input: true }) },
	]);
});

Deno.test("composites return main Schemas, so core methods chain", () => {
	// Given: an array of optional text, mapped to its length
	const lengths = array({ item: optional(text) }).map((items) => items.length);

	// When: parsing with the chained method
	const parsed = unwrap(lengths.parseSync(["a", undefined]));

	// Then: the main Schema's methods ran
	assertInstanceOf(lengths, Schema);
	assertEquals(parsed, 2);
});

Deno.test("a main object schema parses with the mini functions", () => {
	// Given: a main object schema
	const user = object({ shape: { name: text } });

	// When: parsing it with mini parseSync
	const parsed = unwrap(parseSync(user, { name: "Ada", admin: true }));

	// Then: it is a mini Schema too
	assertEquals(parsed, { name: "Ada" });
});
