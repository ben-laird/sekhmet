import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidValue } from "@/src/core/mini/issue.ts";
import { type Output, ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { type Literal, literal } from "./literal.ts";

const panics = definePanicRuntime();

const ID = Symbol("id");

Deno.test("literal accepts exactly its value", () => {
	const values: Literal[] = ["admin", 42, 7n, true, null, undefined, ID];
	for (const value of values) {
		// Given: a literal schema of one primitive
		const schema = literal(value);

		// When: parsing that same value
		const result = parseSync(schema, { input: value, panics });

		// Then: it is accepted
		assertEquals(result, Ok(value));
	}
});

Deno.test("literal rejects other values with InvalidValue", () => {
	const cases: [value: Literal, input: unknown][] = [
		["admin", "Admin"],
		[42, "42"],
		[7n, 7],
		[true, 1],
		[null, undefined],
		[undefined, null],
		[ID, Symbol("id")],
	];
	for (const [value, input] of cases) {
		// Given: a literal schema
		const schema = literal(value);

		// When: parsing a different value, even a loosely equal one
		const result = parseSync(schema, { input: input, panics });

		// Then: it fails listing the one allowed value
		assertEquals(
			result,
			Err(ParseError(InvalidValue({ input, expected: [value] }))),
		);
	}
});

Deno.test("literal compares with SameValueZero", () => {
	// Given: literal schemas of NaN and of 0
	// When: parsing NaN and -0
	// Then: NaN matches NaN, and -0 matches 0
	assertEquals(
		parseSync(literal(Number.NaN), { input: Number.NaN, panics }),
		Ok(Number.NaN),
	);
	assertEquals(parseSync(literal(0), { input: -0, panics }), Ok(-0));
});

Deno.test("literal's output type is the literal's own type", () => {
	// Given: literal schemas of a string and a number
	const admin = literal("admin");
	const answer = literal(42);

	// When: reading their output types
	// Then: they are the narrow literal types
	assertType<IsExact<Output<typeof admin>, "admin">>(true);
	assertType<IsExact<Output<typeof answer>, 42>>(true);
});
