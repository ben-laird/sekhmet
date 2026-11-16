import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assert, assertEquals, assertFalse } from "@std/assert";
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
import { nullable, optional } from "./modifiers.ts";
import { object, type UnknownKeys } from "./object.ts";

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

/** The four ways a field can be absent, on one shape. */
const people = <U extends UnknownKeys>(unknownKeys: U) =>
	object({
		shape: {
			name: text,
			middle: optional(text),
			nickname: { schema: text, key: "optional" },
			alias: { schema: optional(text), key: "optional" },
		},
		unknownKeys,
	});

Deno.test("each field kind handles a missing key and a key present as undefined", async (t) => {
	for (const unknownKeys of ["strip", "strict", "passthrough"] as const) {
		// Given: an object with each kind of field, under each unknown-keys policy
		const person = people(unknownKeys);
		const full = { name: "Ada", middle: "B", nickname: "A", alias: "L" };

		await t.step(
			`${unknownKeys}: a required key must be present and parse`,
			async () => {
				// When: the required key is missing, and when it is undefined
				const { name: _, ...withoutName } = full;
				const missing = unwrapErr(await parseAsync(person, withoutName));
				const blank = unwrapErr(
					await parseAsync(person, { ...full, name: undefined }),
				);

				// Then: both fail with the schema's issue at the key
				assertEquals(entries(missing), [{ path: ["name"], error: "not text" }]);
				assertEquals(entries(blank), [{ path: ["name"], error: "not text" }]);
			},
		);

		await t.step(
			`${unknownKeys}: a value-optional key must be present`,
			async () => {
				// When: the .optional() field's key is missing, and when it is undefined
				const { middle: _, ...withoutMiddle } = full;
				const missing = unwrapErr(await parseAsync(person, withoutMiddle));
				const blank = unwrap(parseSync(person, { ...full, middle: undefined }));

				// Then: missing fails with the inner schema's issue; undefined is kept
				assertEquals(entries(missing), [
					{ path: ["middle"], error: "not text" },
				]);
				assertEquals(blank.middle, undefined);
				assert(Object.hasOwn(blank, "middle"));
			},
		);

		await t.step(
			`${unknownKeys}: a key-optional key may be missing, not undefined`,
			async () => {
				// When: the key-optional field's key is missing, and when it is undefined
				const { nickname: _, ...withoutNickname } = full;
				const missing = unwrap(parseSync(person, withoutNickname));
				const blank = unwrapErr(
					await parseAsync(person, { ...full, nickname: undefined }),
				);

				// Then: missing is left out of the output; undefined fails at the key
				assertFalse(Object.hasOwn(missing, "nickname"));
				assertEquals(entries(blank), [
					{ path: ["nickname"], error: "not text" },
				]);
			},
		);

		await t.step(
			`${unknownKeys}: a key- and value-optional key may be either`,
			() => {
				// When: the doubly optional field's key is missing, and when it is undefined
				const { alias: _, ...withoutAlias } = full;
				const missing = unwrap(parseSync(person, withoutAlias));
				const blank = unwrap(parseSync(person, { ...full, alias: undefined }));

				// Then: missing is left out, and undefined is kept as given
				assertFalse(Object.hasOwn(missing, "alias"));
				assert(Object.hasOwn(blank, "alias"));
				assertEquals(blank.alias, undefined);
			},
		);
	}
});

Deno.test('an explicit key: "required" entry is the same as a bare schema', async () => {
	// Given: the same field written as a schema and as a required entry
	const bare = object({ shape: { name: text } });
	const entry = object({ shape: { name: { schema: text, key: "required" } } });

	// When: parsing a valid value and a missing key with each
	// Then: both give the same results and the same types
	assertEquals(
		parseSync(entry, { name: "Ada" }),
		parseSync(bare, { name: "Ada" }),
	);
	assertEquals(
		entries(unwrapErr(await parseAsync(entry, {}))),
		entries(unwrapErr(await parseAsync(bare, {}))),
	);
	assertType<IsExact<Output<typeof entry>, Output<typeof bare>>>(true);
});

Deno.test("a missing required key is checked without its .optional(), through .nullable()", async () => {
	// Given: a required field that accepts undefined and null
	const user = object({ shape: { middle: nullable(optional(text)) } });

	// When: the key is missing, and when it is null
	const missing = unwrapErr(await parseAsync(user, {}));
	const nulled = unwrap(parseSync(user, { middle: null }));

	// Then: the missing key reports the inner issue, and null still passes
	assertEquals(entries(missing), [{ path: ["middle"], error: "not text" }]);
	assertEquals(nulled, { middle: null });
});

Deno.test("a required field whose own schema accepts undefined passes a missing key", () => {
	// Given: a required field whose schema itself (not .optional()) accepts undefined
	const anything: Schema<unknown, unknown, never> = new Schema((input) =>
		Ok(input),
	);
	const box = object({ shape: { content: anything } });

	// When: the key is missing
	const parsed = unwrap(parseSync(box, {}));

	// Then: it parses as undefined, and the output has the key, as its type says
	assertEquals(parsed, { content: undefined });
	assert(Object.hasOwn(parsed, "content"));
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

	// Then: the output maps the fields (.optional() keeps its key required),
	// and the error flattens every field's error with SchemaIssue
	assertType<IsExact<In, unknown>>(true);
	assertType<
		IsExact<
			Out,
			{ name: string; address: { zip: number }; nickname: string | undefined }
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

Deno.test("each field kind has exact input and output types", () => {
	// Given: one field of each kind, with a typed input so the input type shows
	const typedText = new Schema((input: string) => Ok(input));
	const person = object({
		shape: {
			name: typedText,
			middle: optional(typedText),
			nickname: { schema: typedText, key: "optional" },
			alias: { schema: optional(typedText), key: "optional" },
		},
	});
	const loose = people("passthrough");

	// When: reading its input and output types
	type In = Input<typeof person>;
	type Out = Output<typeof person>;

	// Then: under exactOptionalPropertyTypes, a key-optional field's key is
	// optional without undefined, and .optional() adds undefined to the value
	type Exact = {
		name: string;
		middle: string | undefined;
		nickname?: string;
		alias?: string | undefined;
	};
	assertType<IsExact<In, Exact>>(true);
	assertType<IsExact<Out, Exact>>(true);
	// Then: passthrough keeps the same field types, plus undeclared keys
	assertType<IsExact<Output<typeof loose>, Exact & { [key: string]: unknown }>>(
		true,
	);
});
