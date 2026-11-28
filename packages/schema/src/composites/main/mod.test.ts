import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { resume } from "@sekhmet/panic/outcome/mini";
import { wait } from "@sekhmet/vow";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { Schema } from "@/src/core/main/mod.ts";
import { UnknownKey } from "@/src/core/mini/issue.ts";
import { entries } from "@/src/core/mini/issues.ts";
import { Schema as MiniSchema, parseSync } from "@/src/core/mini/schema.ts";
import { string } from "@/src/primitives/main/mod.ts";
import { string as miniString } from "@/src/primitives/mini/mod.ts";
import { array, object, optional } from "./mod.ts";

const panics = definePanicRuntime();

const text = new Schema({
	parse: (input: unknown) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});

Deno.test("object returns a main Schema, so core methods chain", async () => {
	// Given: a strict main object schema
	const user = object({ shape: { name: text }, unknownKeys: "strict" });

	// When: parsing an object with an extra key through the chained method
	const found = unwrapErr(
		resume(
			await wait(user.parse({ input: { name: "Ada", admin: true }, panics })),
		),
	);

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
	const parsed = unwrap(lengths.parseSync({ input: ["a", undefined], panics }));

	// Then: the main Schema's methods ran
	assertInstanceOf(lengths, Schema);
	assertEquals(parsed, 2);
});

Deno.test("a main object schema parses with the mini functions", () => {
	// Given: a main object schema
	const user = object({ shape: { name: text } });

	// When: parsing it with mini parseSync
	const parsed = unwrap(
		parseSync(user, { input: { name: "Ada", admin: true }, panics }),
	);

	// Then: it is a mini Schema too
	assertEquals(parsed, { name: "Ada" });
});

Deno.test("main composites view their children as main schemas, and keep mini ones mini", () => {
	// Given: a main child and a mini child
	const mainName = string();
	const miniName = miniString();

	// When: building main objects from each
	const user = object({ shape: { name: mainName, tags: mainName.array() } });
	const mixed = object({ shape: { name: miniName } });

	// Then: the object is main and its view holds each child as passed
	assertStrictEquals(user.shape.name, mainName);
	assertStrictEquals(user.shape.tags.item, mainName);
	assertStrictEquals(mixed.shape.name, miniName);
	assertType<IsExact<typeof user.shape.name, typeof mainName>>(true);
	assertType<IsExact<typeof mixed.shape.name, typeof miniName>>(true);
	assertEquals(
		user.shape.name.parseSync({ input: "Ada", panics }).unwrap(),
		"Ada",
	);
	assertInstanceOf(user, Schema);
	assertEquals(Object.getPrototypeOf(mixed.shape.name), MiniSchema.prototype);
});

Deno.test("the modifier methods view their receiver, exactly", () => {
	// Given: a main object with a view
	const user = object({ shape: { name: string() } });

	// When: chaining the modifier methods
	const maybe = user.optional();
	const list = user.nullable().array();

	// Then: each view is the receiver, with its own view
	assertStrictEquals(maybe.inner, user);
	assertStrictEquals(list.item.inner, user);
	assertType<IsExact<typeof maybe.inner, typeof user>>(true);
	assertType<IsExact<typeof list.item.inner, typeof user>>(true);
	assertEquals(
		maybe.inner.shape.name.parseSync({ input: "a", panics }).unwrap(),
		"a",
	);
	assertInstanceOf(maybe, Schema);
	assertInstanceOf(list, Schema);
});
