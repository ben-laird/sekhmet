import { union } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertThrows, fail } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { number } from "@/src/primitives/mini/number.ts";
import { string } from "@/src/primitives/mini/string.ts";
import { is } from "./guard.ts";
import { filter, parseSync, Schema } from "./schema.ts";

Deno.test("is narrows its input in an if", () => {
	// Given: an unknown value and a guard from string()
	const value: unknown = "ada";
	const isString = is(string());

	// When: the guard tests the value
	if (isString(value)) {
		// Then: the value is narrowed to string inside the branch
		assertType<IsExact<typeof value, string>>(true);
		assertEquals(value.toUpperCase(), "ADA");
		return;
	}

	fail("expected the guard to accept a string");
});

Deno.test("is answers whether the schema accepts the input", () => {
	// Given: a guard from string()
	const isString = is(string());

	// When: it tests a value the schema accepts and one it rejects
	const accepted = isString("a");
	const rejected = isString(1);

	// Then: only the accepted value passes
	assertEquals(accepted, true);
	assertEquals(rejected, false);
});

Deno.test("is narrows the element type of Array.prototype.filter", () => {
	// Given: a mixed array
	const values: readonly (string | number)[] = ["a", 1, "b", 2];

	// When: it is filtered with a guard from number()
	const numbers = values.filter(is(number()));

	// Then: the result is typed and filled as the schema's output
	assertType<IsExact<typeof numbers, number[]>>(true);
	assertEquals(numbers, [1, 2]);
});

Deno.test("is keeps the input type the schema's input narrows", () => {
	// Given: a schema whose input is a string, accepting one literal
	const admin = new Schema({
		parse: (input: string) => {
			return input === "admin" ? Ok<"admin", string>(input) : Err("not admin");
		},
	});

	// When: a guard from it filters strings
	const roles = ["user", "admin"].filter(is(admin));

	// Then: the result is the output intersected with the input
	assertType<IsExact<typeof roles, "admin"[]>>(true);
	assertEquals(roles, ["admin"]);
});

Deno.test("is works as filter's predicate", () => {
	// Given: a schema accepting strings or numbers, filtered to strings by a guard
	const scalar = new Schema({
		parse: (input: unknown) => {
			if (typeof input === "string" || typeof input === "number") {
				return Ok<string | number, string>(input);
			}

			return Err<string | number, string>("not a scalar");
		},
	});
	const text = filter(scalar, {
		error: () => "not text",
		predicate: is(string()),
	});

	// When: it parses a string and a number
	const accepted = parseSync(text, "a");
	const rejected = parseSync(text, 1);

	// Then: the output is narrowed to string, and the number fails with the error
	assertType<IsExact<typeof text, Schema<unknown, string, string>>>(true);
	assertEquals(unwrap(accepted), "a");
	assertEquals(union(unwrapErr(rejected)), "not text");
});

Deno.test("is only checks a transforming schema's output, not the input", () => {
	// Given: guards from schemas that transform (trim, coercion)
	const isShort = is(string({ trim: true, maxLength: 1 }));
	const isNumber = is(number({ coerce: true }));

	// When: they test inputs that pass only after transforming
	const padded = isShort("  a  ");
	const numeric: unknown = "42";
	const coerced = isNumber(numeric);

	// Then: both guards accept, though neither input is the output (the documented caveat)
	assertEquals(padded, true);
	assertEquals(coerced, true);
	assertEquals(typeof numeric, "string");
});

Deno.test("is panics on a schema that parses asynchronously", () => {
	// Given: a guard from an async schema
	const later = new Schema({
		parse: (input: string) => Promise.resolve(Ok<string, string>(input)),
	});
	const isLater = is(later);

	// When: the guard tests a value
	// Then: it panics with a message naming the cause
	assertThrows(
		() => isLater("a"),
		TypeError,
		"the schema parsed asynchronously",
	);
});
