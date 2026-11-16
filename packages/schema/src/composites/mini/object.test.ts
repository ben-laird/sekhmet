import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertFalse } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	UnknownKey,
} from "@/src/core/mini/issue.ts";
import { entries, type Issues } from "@/src/core/mini/issues.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	parseAsync,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { optional } from "./modifiers.ts";
import { object } from "./object.ts";

const text: Schema<unknown, string, "not text"> = new Schema((input) =>
	typeof input === "string" ? Ok(input) : Err("not text"),
);
const count: Schema<unknown, number, "not a number"> = new Schema((input) =>
	typeof input === "number" ? Ok(input) : Err("not a number"),
);
const laterCount: Schema<unknown, number, "not a number"> = new Schema(
	(input) =>
		Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		),
);

Deno.test("object parses each field and strips undeclared keys", () => {
	// Given: an object schema with two fields
	const user = object({ shape: { name: text, age: count } });

	// When: parsing an object with an extra key
	const parsed = unwrap(parseSync(user, { name: "Ada", age: 36, admin: true }));

	// Then: the declared fields are kept and the extra key is dropped
	assertEquals(parsed, { name: "Ada", age: 36 });
});

Deno.test("object reports every failing field at its path", async () => {
	// Given: an object schema with two fields
	const user = object({ shape: { name: text, age: count } });

	// When: parsing an object where both fields are wrong
	const found = unwrapErr(await parseAsync(user, { name: 1, age: "x" }));

	// Then: each failure is located under its key, in shape order
	assertEquals(entries(found), [
		{ path: ["name"], error: "not text" },
		{ path: ["age"], error: "not a number" },
	]);
});

Deno.test("object flattens nested composites' issues into one path", async () => {
	// Given: a user with a nested address
	const user = object({
		shape: { address: object({ shape: { zip: text } }) },
	});

	// When: parsing a user whose nested zip is wrong
	const found = unwrapErr(await parseAsync(user, { address: { zip: 1 } }));

	// Then: the nested issue's path runs from the root
	assertEquals(entries(found), [
		{ path: ["address", "zip"], error: "not text" },
	]);
});

Deno.test("object rejects non-objects with InvalidType at the root", async (t) => {
	// Given: an object schema
	const user = object({ shape: { name: text } });

	for (const input of [null, [], "Ada", 1, undefined]) {
		await t.step(`${JSON.stringify(input) ?? "undefined"}`, async () => {
			// When: parsing a value that isn't a plain object
			const found = unwrapErr(await parseAsync(user, input));

			// Then: one InvalidType issue is reported at the root
			assertEquals(entries(found), [
				{ path: [], error: InvalidType({ input, expected: "object" }) },
			]);
		});
	}
});

Deno.test("object treats a missing key as undefined, so optional fields may be missing", async () => {
	// Given: an object with a required and an optional field
	const user = object({ shape: { name: text, nickname: optional(text) } });

	// When: parsing objects missing each of them
	const withoutNickname = unwrap(parseSync(user, { name: "Ada" }));
	const found = unwrapErr(await parseAsync(user, { nickname: "A" }));

	// Then: the optional key stays absent, and the required one fails
	assertEquals(withoutNickname, { name: "Ada" });
	assertFalse("nickname" in withoutNickname);
	assertEquals(entries(found), [{ path: ["name"], error: "not text" }]);
});

Deno.test("object keeps an optional key that is present as undefined", () => {
	// Given: an object with an optional field
	const user = object({ shape: { nickname: optional(text) } });

	// When: parsing an object that has the key set to undefined
	const parsed = unwrap(parseSync(user, { nickname: undefined }));

	// Then: the key is kept, as given
	assertEquals(Object.keys(parsed), ["nickname"]);
});

Deno.test('unknownKeys: "strict" reports each undeclared key as UnknownKey after field issues', async () => {
	// Given: a strict object schema
	const user = object({ shape: { name: text }, unknownKeys: "strict" });

	// When: parsing an object with a bad field and two extra keys
	const found = unwrapErr(
		await parseAsync(user, { name: 1, admin: true, role: "root" }),
	);

	// Then: the field issue comes first, then one UnknownKey per extra key
	assertEquals(entries(found), [
		{ path: ["name"], error: "not text" },
		{ path: ["admin"], error: UnknownKey({ key: "admin", input: true }) },
		{ path: ["role"], error: UnknownKey({ key: "role", input: "root" }) },
	]);
});

Deno.test('unknownKeys: "passthrough" copies undeclared keys, "strip" drops them', () => {
	// Given: the same shape, passing through and stripping undeclared keys
	const shape = { name: text };
	const loose = object({ shape, unknownKeys: "passthrough" });
	const lenient = object({ shape, unknownKeys: "strip" });

	// When: parsing an object with an extra key
	const input = { name: "Ada", admin: true };

	// Then: passthrough keeps it, strip drops it
	assertEquals(unwrap(parseSync(loose, input)), input);
	assertEquals(unwrap(parseSync(lenient, input)), { name: "Ada" });
});

Deno.test("passthrough can't set the output's prototype through __proto__", () => {
	// Given: a passthrough object and an input with an own __proto__ key
	const loose = object({ shape: {}, unknownKeys: "passthrough" });
	const input = JSON.parse('{"__proto__": {"polluted": true}}');

	// When: parsing it
	const parsed = unwrap(parseSync(loose, input));

	// Then: __proto__ is an own data property; the prototype is untouched
	assertEquals(Object.getPrototypeOf(parsed), Object.prototype);
	assertEquals(Object.hasOwn(parsed, "__proto__"), true);
});

Deno.test("object stays Sync when every field is Sync, and is Async otherwise", async () => {
	// Given: a sync object and one mixing sync and async fields
	const now = object({ shape: { name: text, age: count } });
	const mixed = object({ shape: { name: text, age: laterCount } });

	// When: parsing with each
	const nowKind = unionKinds(parse(now, { name: "Ada", age: 36 }));
	const mixedKind = unionKinds(parse(mixed, { name: "Ada", age: 36 }));

	// Then: only the mixed object is Async, and it still parses
	assertEquals(nowKind, "Sync");
	assertEquals(mixedKind, "Async");
	assertEquals(unwrap(await parseAsync(mixed, { name: "Ada", age: 36 })), {
		name: "Ada",
		age: 36,
	});
});

Deno.test("an async object still collects every issue", async () => {
	// Given: an object mixing sync and async fields
	const mixed = object({ shape: { name: text, age: laterCount } });

	// When: parsing an input where both fields fail
	const found = unwrapErr(await parseAsync(mixed, { name: 1, age: "x" }));

	// Then: both issues are reported, in shape order
	assertEquals(entries(found), [
		{ path: ["name"], error: "not text" },
		{ path: ["age"], error: "not a number" },
	]);
});

Deno.test("parseSync reports UnexpectedAsyncParse for an object with an async field", () => {
	// Given: an object mixing sync and async fields
	const mixed = object({ shape: { name: text, age: laterCount } });

	// When: parsing it synchronously
	const error = unwrapErr(parseSync(mixed, { name: "Ada", age: 36 }));

	// Then: the parse is reported as unexpectedly async
	assertEquals(unionKinds(error), "UnexpectedAsyncParse");
});

Deno.test("object infers its input, output and error types", () => {
	// Given: an object with required, optional and nested fields
	const user = object({
		shape: {
			name: text,
			nickname: optional(text),
			address: object({ shape: { zip: count } }),
		},
	});
	const typed = object({
		shape: { id: new Schema((input: string) => Ok(input.length)) },
	});
	const loose = object({ shape: { name: text }, unknownKeys: "passthrough" });
	const strict = object({ shape: { name: text }, unknownKeys: "strict" });

	// When: reading its types
	type In = Input<typeof user>;
	type Out = Output<typeof user>;
	type Error = ErrorOf<typeof user>;

	// Then: the output maps the fields, optional ones optional, and the
	// error flattens every field's error with SchemaIssue
	assertType<IsExact<In, unknown>>(true);
	assertType<
		IsExact<
			Out,
			{ name: string; address: { zip: number }; nickname?: string | undefined }
		>
	>(true);
	assertType<IsExact<Error, Issues<"not text" | "not a number" | SchemaIssue>>>(
		true,
	);
	assertType<IsExact<Input<typeof typed>, { id: string }>>(true);
	// Then: passthrough keeps undeclared keys in the output type; strict doesn't
	assertType<
		IsExact<Output<typeof loose>, { [key: string]: unknown; name: string }>
	>(true);
	assertType<IsExact<Output<typeof strict>, { name: string }>>(true);
});
