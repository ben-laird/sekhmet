import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidType,
	type SchemaIssue,
	TooBig,
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
import { tuple } from "./tuple.ts";

const text: Schema<unknown, string, "not text"> = new Schema({
	parse: (input) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
const count: Schema<unknown, number, "not a number"> = new Schema({
	parse: (input) => {
		return typeof input === "number" ? Ok(input) : Err("not a number");
	},
});
const laterCount: Schema<unknown, number, "not a number"> = new Schema({
	parse: (input) => {
		return Promise.resolve(
			typeof input === "number" ? Ok(input) : Err("not a number"),
		);
	},
});

Deno.test("tuple parses each element with its own schema", () => {
	// Given: a (text, number) tuple
	const pair = tuple([text, count]);

	// When: parsing a matching array
	const parsed = unwrap(parseSync(pair, ["apples", 3]));

	// Then: both elements are kept
	assertEquals(parsed, ["apples", 3]);
});

Deno.test("tuple reports every failing element at its index", async () => {
	// Given: a (text, number) tuple
	const pair = tuple([text, count]);

	// When: parsing an array where both elements are wrong
	const issues = unwrapErr(await parseAsync(pair, [1, "x"]));

	// Then: each issue is at its index
	assertEquals(entries(issues), [
		{ path: [0], error: "not text" },
		{ path: [1], error: "not a number" },
	]);
});

Deno.test("tuple parses missing elements as undefined", async () => {
	// Given: a tuple whose second element is optional
	const pair = tuple([text, optional(count)]);

	// When: parsing a one-element array, and an empty one
	const parsed = unwrap(parseSync(pair, ["apples"]));
	const issues = unwrapErr(await parseAsync(pair, []));

	// Then: the optional element is undefined; the required one fails
	assertEquals(parsed, ["apples", undefined]);
	assertEquals(entries(issues), [{ path: [0], error: "not text" }]);
});

Deno.test("tuple rejects extra elements with TooBig, after element issues", async () => {
	// Given: a one-element tuple
	const single = tuple([text]);

	// When: parsing a wrong first element plus an extra one
	const input = [1, 2];
	const issues = unwrapErr(await parseAsync(single, input));

	// Then: the element issue comes first, then TooBig at the root
	assertEquals(entries(issues), [
		{ path: [0], error: "not text" },
		{
			path: [],
			error: TooBig({ input, origin: "array", maximum: 1, inclusive: true }),
		},
	]);
});

Deno.test("tuple rejects non-arrays with InvalidType at the root", async () => {
	// Given: a tuple schema
	const single = tuple([text]);

	// When: parsing a string
	const issues = unwrapErr(await parseAsync(single, "apples"));

	// Then: one InvalidType issue is reported at the root
	assertEquals(entries(issues), [
		{ path: [], error: InvalidType({ input: "apples", expected: "array" }) },
	]);
});

Deno.test("tuple is Async when any element is", async () => {
	// Given: a tuple with an async element
	const pair = tuple([text, laterCount]);

	// When: parsing it
	const kind = unionKinds(parse(pair, ["a", 1]));

	// Then: the parse is Async and still succeeds
	assertEquals(kind, "Async");
	assertEquals(unwrap(await parseAsync(pair, ["a", 1])), ["a", 1]);
});

Deno.test("tuple infers its input, output and error types", () => {
	// Given: a loose tuple and one with a typed element
	const pair = tuple([text, count]);
	const typed = tuple([
		text,
		new Schema({ parse: (input: string) => Ok(input.length) }),
	]);

	// When: reading their types
	// Then: output and input are tuples; the error flattens each element's
	assertType<IsExact<Input<typeof pair>, unknown>>(true);
	assertType<IsExact<Output<typeof pair>, [string, number]>>(true);
	assertType<
		IsExact<
			ErrorOf<typeof pair>,
			Issues<"not text" | "not a number" | SchemaIssue>
		>
	>(true);
	assertType<IsExact<Input<typeof typed>, readonly [unknown, string]>>(true);
});

Deno.test("tuple views its element schemas, exactly as passed", () => {
	// Given: element schemas, one wrapped
	const maybeCount = optional(count);

	// When: building a tuple of them
	const pair = tuple([text, maybeCount]);

	// Then: .items is the tuple passed, each element keeping its type
	assertStrictEquals(pair.items[0], text);
	assertStrictEquals(pair.items[1].inner, count);
	assertType<
		IsExact<typeof pair.items, readonly [typeof text, typeof maybeCount]>
	>(true);
	assertType<IsExact<Output<typeof pair>, [string, number | undefined]>>(true);
});
