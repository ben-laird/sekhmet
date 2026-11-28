import { Err, isErr, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { optional } from "@/src/composites/mini/modifiers.ts";
import {
	type Field,
	object,
	type Shape,
} from "@/src/composites/mini/object.ts";
import {
	type Input,
	type Output,
	parseSync,
	Schema,
} from "@/src/core/mini/schema.ts";
import { omit, partial, pick, required } from "./shape.ts";

const panics = definePanicRuntime();

type Text = Schema<unknown, string, "not text">;
const text: Text = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
const maybeText = optional(text);

/** One of each field kind of the #28 table. */
const kinds = {
	plain: text,
	value: maybeText,
	key: { schema: text, key: "optional" },
	both: { schema: maybeText, key: "optional" },
} satisfies Shape;

Deno.test("pick keeps only the given keys, as declared", () => {
	// Given: a shape with every field kind
	// When: picking two keys
	const picked = pick({ shape: kinds, keys: ["plain", "key"] });

	// Then: exactly those entries remain, unchanged
	assertEquals(Object.keys(picked), ["plain", "key"]);
	assertStrictEquals(picked.plain, kinds.plain);
	assertStrictEquals(picked.key, kinds.key);
	assertType<
		IsExact<
			typeof picked,
			{ plain: Text; key: { schema: Text; key: "optional" } }
		>
	>(true);
});

Deno.test("omit drops the given keys, keeping the rest as declared", () => {
	// Given: a shape with every field kind
	// When: omitting two keys
	const rest = omit({ shape: kinds, keys: ["plain", "key"] });

	// Then: the other entries remain, unchanged
	assertEquals(Object.keys(rest), ["value", "both"]);
	assertStrictEquals(rest.both, kinds.both);
	assertType<IsExact<keyof typeof rest, "value" | "both">>(true);
});

Deno.test("pick and omit infer their keys when passed straight to object", () => {
	// Given: a shape
	const user = { name: text, email: text };

	// When: picking and omitting inline, as object's shape
	const named = object({ shape: pick({ shape: user, keys: ["name"] }) });
	const unmailed = object({ shape: omit({ shape: user, keys: ["email"] }) });

	// Then: only the named keys are kept, by type and at runtime
	assertType<IsExact<Output<typeof named>, { name: string }>>(true);
	assertType<IsExact<Output<typeof unmailed>, { name: string }>>(true);
	assertEquals(
		unwrap(parseSync(named, { input: { name: "a", email: "b" }, panics })),
		{
			name: "a",
		},
	);
});

Deno.test("pick and omit reject keys the shape doesn't declare", () => {
	// Given: a shape
	const shape = { name: text };

	// When: naming an undeclared key
	// Then: it is a type error
	// @ts-expect-error "age" is not a key of the shape
	pick({ shape, keys: ["age"] });
	// @ts-expect-error "age" is not a key of the shape
	omit({ shape, keys: ["age"] });
	assertEquals(Object.keys(pick({ shape, keys: ["name"] })), ["name"]);
});

Deno.test("partial makes every key optional, keeping value-optionality", () => {
	// Given: an object of every field kind, made partial
	const all = object({ shape: partial(kinds) });

	// When: parsing with every key missing, and with each present as undefined
	const empty = parseSync(all, { input: {}, panics });
	const undefinedEach = Object.keys(kinds).map((key) => {
		return [
			key,
			isErr(parseSync(all, { input: { [key]: undefined }, panics })),
		];
	});

	// Then: every key may be missing; only the value-optional ones accept undefined
	assertEquals(unwrap(empty), {});
	assertEquals(undefinedEach, [
		["plain", true],
		["value", false],
		["key", true],
		["both", false],
	]);
});

Deno.test("required makes every key required, keeping value-optionality", () => {
	// Given: an object of every field kind, made required
	const all = object({ shape: required(kinds) });
	const full = { plain: "a", value: "b", key: "c", both: "d" };

	// When: parsing with each key missing, and with each present as undefined
	const missingEach = Object.keys(kinds).map((key) => {
		const rest = Object.fromEntries(
			Object.entries(full).filter(([other]) => {
				return other !== key;
			}),
		);
		return [key, isErr(parseSync(all, { input: rest, panics }))];
	});
	const undefinedEach = Object.keys(kinds).map((key) => {
		return [
			key,
			isErr(parseSync(all, { input: { ...full, [key]: undefined }, panics })),
		];
	});

	// Then: every key must be present; only the value-optional ones accept undefined
	assertEquals(unwrap(parseSync(all, { input: full, panics })), full);
	assertEquals(
		missingEach.map(([, failed]) => failed),
		[true, true, true, true],
	);
	assertEquals(undefinedEach, [
		["plain", true],
		["value", false],
		["key", true],
		["both", false],
	]);
});

Deno.test("reshaped shapes give the object types of the #28 table", () => {
	// Given: objects of a partial and a required shape of every field kind
	const loose = object({ shape: partial(kinds) });
	const strict = object({ shape: required(kinds) });

	// When: reading their output types
	// Then: partial makes every key optional, required every key required,
	// and both keep `| undefined` exactly where the value is optional
	assertType<
		IsExact<
			Output<typeof loose>,
			{
				plain?: string;
				value?: string | undefined;
				key?: string;
				both?: string | undefined;
			}
		>
	>(true);
	assertType<
		IsExact<
			Output<typeof strict>,
			{
				plain: string;
				value: string | undefined;
				key: string;
				both: string | undefined;
			}
		>
	>(true);
	assertType<IsExact<Input<typeof strict>, unknown>>(true);
});

Deno.test("partial and required type each entry", () => {
	// Given: a shape with every field kind
	// When: reshaping it
	const loose = partial(kinds);
	const strict = required(kinds);

	// Then: partial's entries are optional fields of each schema, and
	// required's are the bare schemas
	assertType<IsExact<typeof loose.key, Field<Text, "optional">>>(true);
	assertType<IsExact<typeof loose.plain, Field<Text, "optional">>>(true);
	assertType<IsExact<typeof strict.key, Text>>(true);
	assertType<IsExact<typeof strict.both, typeof maybeText>>(true);
	assertStrictEquals(strict.key, text);
	assertEquals(loose.plain, { schema: text, key: "optional" });
});

Deno.test("a shape spread extends a shape", () => {
	// Given: a shape and an extension of it
	const base = { name: text } satisfies Shape;
	const extended = {
		...base,
		nickname: { schema: text, key: "optional" },
	} satisfies Shape;

	// When: building an object of the extension
	const user = object({ shape: extended });

	// Then: it has both fields, the new one with its optional key
	assertEquals(unwrap(parseSync(user, { input: { name: "Ada" }, panics })), {
		name: "Ada",
	});
	assertType<IsExact<Output<typeof user>, { name: string; nickname?: string }>>(
		true,
	);
});
