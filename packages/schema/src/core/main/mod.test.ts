import { Result } from "@sekhmet/enum/result";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { object } from "@/src/composites/main/mod.ts";
import { number, string } from "@/src/primitives/main/mod.ts";
import {
	type ErrorOf,
	entries,
	type Input,
	type Issues,
	type Output,
	ParseError,
	Schema,
	type SchemaIssue,
	TooSmall,
} from "./mod.ts";

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

Deno.test("Schema has exactly the modifier, transform and parsing methods", () => {
	// Given: the main Schema's prototype
	const methods = Object.getOwnPropertyNames(Schema.prototype)
		.filter((name) => name !== "constructor")
		.sort();

	// When: listing its own methods
	// Then: they are the shape modifiers, the transforms and the parsers, only
	assertEquals(methods, [
		"array",
		"filter",
		"map",
		"mapErr",
		"nullable",
		"optional",
		"parse",
		"parseAsync",
		"parseSync",
		"pipe",
	]);
});

Deno.test(".array() parses every element with the receiver, and chains", async () => {
	// Given: an array of digit strings, built by the method
	const all = digits.array();

	// When: parsing a valid array and one with a failing element
	const parsed = unwrap(all.parseSync(["1", "22"]));
	const found = unwrapErr(await all.parseAsync(["1", "x"]));

	// Then: it is a main Schema of arrays, reporting each element at its index
	assertInstanceOf(all, Schema);
	assertEquals(parsed, [1, 22]);
	assertEquals(entries(found), [{ path: [1], error: "not digits" }]);
});

Deno.test(".optional() and .nullable() pass undefined and null through", () => {
	// Given: a number schema that may be missing or null
	const maybe = number({ min: 0 }).optional().nullable();

	// When: parsing undefined, null, a valid and an invalid number
	// Then: the modifiers pass their value through and the rest is checked
	assertEquals(unwrap(maybe.parseSync(undefined)), undefined);
	assertEquals(unwrap(maybe.parseSync(null)), null);
	assertEquals(unwrap(maybe.parseSync(1)), 1);
	assertEquals(
		unwrapErr(maybe.parseSync(-1)),
		ParseError(
			TooSmall({ input: -1, origin: "number", minimum: 0, inclusive: true }),
		),
	);
});

Deno.test("the modifiers' types: arrays, optional keys and nullable values", () => {
	// Given: schemas built with the modifier methods
	const tags = string().array();
	const user = object({
		shape: { name: string(), age: number().optional(), tags },
	});
	const nickname = string().nullable();

	// When: reading their types
	// Then: .array() maps the element's types, .optional() makes the key
	// optional, and .nullable() adds null to the input and output
	assertType<IsExact<Input<typeof tags>, unknown>>(true);
	assertType<IsExact<Output<typeof tags>, string[]>>(true);
	assertType<IsExact<ErrorOf<typeof tags>, Issues<SchemaIssue>>>(true);
	assertType<
		IsExact<
			Output<typeof user>,
			{ name: string; tags: string[]; age?: number | undefined }
		>
	>(true);
	assertType<IsExact<Output<typeof nickname>, string | null>>(true);
	assertType<
		IsExact<Input<ReturnType<typeof digits.array>>, readonly string[]>
	>(true);
});
