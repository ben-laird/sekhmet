import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import {
	filter,
	map,
	mapErr,
	parse,
	parseAsync,
	parseSync,
	pipe,
	Schema,
} from "./schema.ts";

Deno.test("parse handles synchronous schemas", () => {
	// Given: a synchronous schema
	const schema = new Schema((input: number) => Ok(input * 2));

	// When: parsing input
	const result = parse(schema, 10);

	// Then: the result should be a synchronous Potential
	const value = match(result)({
		Sync: (r) => r,
		Async: () => {
			throw new Error("Should not be async");
		},
	});

	assertEquals(match(value)({ Ok: (v) => v, Err: () => -1 }), 20);
});

Deno.test("parse handles asynchronous schemas", async () => {
	// Given: an asynchronous schema
	const schema = new Schema((input: number) => Promise.resolve(Ok(input * 2)));

	// When: parsing input
	const result = parse(schema, 10);

	// Then: the result should be an asynchronous Potential
	const value = await match(result)({
		Sync: () => {
			throw new Error("Should not be sync");
		},
		Async: (p) => p,
	});

	assertEquals(match(value)({ Ok: (v) => v, Err: () => -1 }), 20);
});

Deno.test("parseSync succeeds with synchronous schema", () => {
	// Given: a synchronous schema
	const schema = new Schema((input: number) => Ok(input * 2));

	// When: parsing synchronously
	const result = parseSync(schema, 10);

	// Then: the result should be Ok
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		20,
	);
});

Deno.test("parseSync fails with asynchronous schema", () => {
	// Given: an asynchronous schema
	const schema = new Schema((input: number) => Promise.resolve(Ok(input * 2)));

	// When: parsing synchronously
	const result = parseSync(schema, 10);

	// Then: the result should be an UnexpectedAsyncParse error
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => "async",
			ParseError: () => "parse",
		}),
		"async",
	);
});

Deno.test("parseSync wraps parse errors", () => {
	// Given: a schema that returns an error
	const schema = new Schema((_input: number) => Err(new TypeError()));

	// When: parsing synchronously
	const result = parseSync(schema, 10);

	// Then: the error should be wrapped in ParseError
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => "async",
			ParseError: () => "parse",
		}),
		"parse",
	);
});

Deno.test("parseAsync handles synchronous schemas", async () => {
	// Given: a synchronous schema
	const schema = new Schema((input: number) => Ok(input * 2));

	// When: parsing asynchronously
	const result = await parseAsync(schema, 10);

	// Then: the result should be Ok
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		20,
	);
});

Deno.test("parseAsync handles asynchronous schemas", async () => {
	// Given: an asynchronous schema
	const schema = new Schema((input: number) => Promise.resolve(Ok(input * 2)));

	// When: parsing asynchronously
	const result = await parseAsync(schema, 10);

	// Then: the result should be Ok
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		20,
	);
});

Deno.test("map transforms successful results", () => {
	// Given: a schema that returns a number
	const schema = new Schema((input: number) => Ok(input));

	// When: mapping the output
	const mapped = map(schema, (n) => n * 2);
	const result = parseSync(mapped, 10);

	// Then: the output should be transformed
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		20,
	);
});

Deno.test("map preserves errors", () => {
	// Given: a schema that returns an error
	const schema = new Schema((_input: number) => Err(new TypeError()));

	// When: mapping the output
	const mapped = map(schema, (n: number) => n * 2);
	const result = parseSync(mapped, 10);

	// Then: the error should be preserved
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});

Deno.test("mapErr transforms errors", () => {
	// Given: a schema that returns a TypeError
	const schema = new Schema((_input: number) => Err(new TypeError("original")));

	// When: mapping the error
	const mapped = mapErr(schema, (e) => new Error(e.message + " transformed"));
	const result = parseSync(mapped, 10);

	// Then: the error should be transformed
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	const innerError = match(error!)({
		UnexpectedAsyncParse: () => null,
		ParseError: (e) => e,
	});

	assertEquals(innerError?.message, "original transformed");
});

Deno.test("pipe chains schemas together", () => {
	// Given: two schemas
	const first = new Schema((input: string) => Ok(input.length));
	const second = new Schema((input: number) => Ok(input * 2));

	// When: piping them together
	const piped = pipe(first, second);
	const result = parseSync(piped, "hello");

	// Then: the output should be the chained result
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		10, // "hello".length * 2 = 5 * 2 = 10
	);
});

Deno.test("pipe short-circuits on first error", () => {
	// Given: a schema that errors and a second schema
	const first = new Schema((_input: string) => Err(new TypeError()));
	const second = new Schema((input: number) => Ok(input * 2));

	// When: piping them together
	const piped = pipe(first, second);
	const result = parseSync(piped, "hello");

	// Then: the error should be propagated without running the second schema
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});

Deno.test("filter accepts values that pass the predicate", () => {
	// Given: a schema and a type guard
	const schema = new Schema((input: number) => Ok(input));
	const isPositive = (n: number): n is number => n > 0;

	// When: filtering with the predicate
	const filtered = filter(schema, new TypeError(), isPositive);
	const result = parseSync(filtered, 10);

	// Then: the value should pass through
	assertEquals(
		match(result)({
			Ok: (v) => v,
			Err: () => -1,
		}),
		10,
	);
});

Deno.test("filter rejects values that fail the predicate", () => {
	// Given: a schema and a type guard
	const schema = new Schema((input: number) => Ok(input));
	const isPositive = (n: number): n is number => n > 0;

	// When: filtering with the predicate on a negative value
	const filtered = filter(schema, new TypeError(), isPositive);
	const result = parseSync(filtered, -10);

	// Then: the error should be returned
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});

	assertEquals(
		match(error!)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});
