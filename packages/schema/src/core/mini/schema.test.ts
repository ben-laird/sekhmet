import { match, union, unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Ok as MainOk } from "@sekhmet/enum/result";
import {
	Err,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import {
	assertEquals,
	assertExists,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type AnySchema,
	andThen,
	type ErrorOf,
	filter,
	type Infer,
	type Input,
	inspect,
	inspectErr,
	map,
	mapErr,
	type Output,
	orElse,
	parse,
	parseAsync,
	parseSync,
	pipe,
	preprocess,
	Schema,
} from "./schema.ts";
import type { TransformView } from "./view.ts";

Deno.test("parse handles synchronous schemas", () => {
	// Given: a synchronous schema
	const schema = new Schema({ parse: (input: number) => Ok(input * 2) });

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
	const schema = new Schema({
		parse: (input: number) => Promise.resolve(Ok(input * 2)),
	});

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
	const schema = new Schema({ parse: (input: number) => Ok(input * 2) });

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
	const schema = new Schema({
		parse: (input: number) => Promise.resolve(Ok(input * 2)),
	});

	// When: parsing synchronously
	const result = parseSync(schema, 10);

	// Then: the result should be an UnexpectedAsyncParse error
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => "async",
			ParseError: () => "parse",
		}),
		"async",
	);
});

Deno.test("parseSync wraps parse errors", () => {
	// Given: a schema that returns an error
	const schema = new Schema({
		parse: (_input: number) => Err(new TypeError()),
	});

	// When: parsing synchronously
	const result = parseSync(schema, 10);

	// Then: the error should be wrapped in ParseError
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => "async",
			ParseError: () => "parse",
		}),
		"parse",
	);
});

Deno.test("parseAsync handles synchronous schemas", async () => {
	// Given: a synchronous schema
	const schema = new Schema({ parse: (input: number) => Ok(input * 2) });

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
	const schema = new Schema({
		parse: (input: number) => Promise.resolve(Ok(input * 2)),
	});

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
	const schema = new Schema({ parse: (input: number) => Ok(input) });

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
	const schema = new Schema({
		parse: (_input: number) => Err(new TypeError()),
	});

	// When: mapping the output
	const mapped = map(schema, (n: number) => n * 2);
	const result = parseSync(mapped, 10);

	// Then: the error should be preserved
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});

Deno.test("mapErr transforms errors", () => {
	// Given: a schema that returns a TypeError
	const schema = new Schema({
		parse: (_input: number) => Err(new TypeError("original")),
	});

	// When: mapping the error
	const mapped = mapErr(schema, (e) => new Error(`${e.message} transformed`));
	const result = parseSync(mapped, 10);

	// Then: the error should be transformed
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	const innerError = match(error)({
		UnexpectedAsyncParse: () => null,
		ParseError: (e) => e,
	});

	assertEquals(innerError?.message, "original transformed");
});

Deno.test("pipe chains schemas together", () => {
	// Given: two schemas
	const first = new Schema({ parse: (input: string) => Ok(input.length) });
	const second = new Schema({ parse: (input: number) => Ok(input * 2) });

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
	const first = new Schema({ parse: (_input: string) => Err(new TypeError()) });
	const second = new Schema({ parse: (input: number) => Ok(input * 2) });

	// When: piping them together
	const piped = pipe(first, second);
	const result = parseSync(piped, "hello");

	// Then: the error should be propagated without running the second schema
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});

Deno.test("filter accepts values that pass the predicate", () => {
	// Given: a schema and a type guard
	const schema = new Schema({ parse: (input: number) => Ok(input) });
	const isPositive = (n: number): n is number => n > 0;

	// When: filtering with the predicate
	const filtered = filter(schema, {
		error: () => new TypeError(),
		predicate: isPositive,
	});
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
	const schema = new Schema({ parse: (input: number) => Ok(input) });
	const isPositive = (n: number): n is number => n > 0;

	// When: filtering with the predicate on a negative value
	const filtered = filter(schema, {
		error: () => new TypeError(),
		predicate: isPositive,
	});
	const result = parseSync(filtered, -10);

	// Then: the error should be returned
	const error = match(result)({
		Ok: () => null,
		Err: (e) => e,
	});
	assertExists(error);

	assertEquals(
		match(error)({
			UnexpectedAsyncParse: () => false,
			ParseError: () => true,
		}),
		true,
	);
});

Deno.test("filter builds its error from the rejected output", () => {
	// Given: a filter whose error records the output it was built from
	const schema = new Schema({
		parse: (input: number) => Ok<number, string>(input),
	});
	const filtered = filter(schema, {
		error: (n) => `${n} is not positive`,
		predicate: (n): n is number => n > 0,
	});

	// When: parsing a value that fails the predicate
	const result = parseSync(filtered, -10);

	// Then: the error carries the rejected output
	assertEquals(union(unwrapErr(result)), "-10 is not positive");
});

Deno.test("filter builds its error from the rejected output of an async schema", async () => {
	// Given: an async schema, filtered with an error that records its output
	const schema = new Schema({
		parse: (input: number) => Promise.resolve(Ok<number, string>(input)),
	});
	const filtered = filter(schema, {
		error: (n) => `${n} is not positive`,
		predicate: (n): n is number => n > 0,
	});

	// When: parsing a value that fails the predicate
	const result = await parseAsync(filtered, -10);

	// Then: the error carries the rejected output
	assertEquals(unwrapErr(result), "-10 is not positive");
});

Deno.test("filter does not build an error for an accepted output", async () => {
	// Given: sync and async schemas, filtered with an error builder that counts its calls
	const built: number[] = [];
	const options = {
		error: (n: number) => {
			built.push(n);
			return "not positive";
		},
		predicate: (n: number): n is number => n > 0,
	};
	const sync = filter(
		new Schema({ parse: (input: number) => Ok<number, string>(input) }),
		options,
	);
	const async = filter(
		new Schema({
			parse: (input: number) => Promise.resolve(Ok<number, string>(input)),
		}),
		options,
	);

	// When: parsing values that pass the predicate
	const syncResult = parseSync(sync, 10);
	const asyncResult = await parseAsync(async, 20);

	// Then: both pass through, and the error builder was never called
	assertEquals(unwrap(syncResult), 10);
	assertEquals(unwrap(asyncResult), 20);
	assertEquals(built, []);
});

Deno.test("Input, Output, Infer and ErrorOf extract a schema's types", () => {
	// Given: a schema from strings to numbers failing with RangeError
	const schema = new Schema({
		parse: (input: string): Result<number, RangeError> => Ok(input.length),
	});
	type S = typeof schema;

	// When: extracting its type parameters
	// Then: each helper names the matching one
	assertType<IsExact<Input<S>, string>>(true);
	assertType<IsExact<Output<S>, number>>(true);
	assertType<IsExact<Infer<S>, number>>(true);
	assertType<IsExact<ErrorOf<S>, RangeError>>(true);
});

Deno.test("AnySchema accepts every schema", () => {
	// Given: schemas with unrelated input, output and error types
	const schemas = [
		new Schema({ parse: (input: string) => Ok(input.length) }),
		new Schema({
			parse: (input: unknown) => Err(new TypeError(String(input))),
		}),
		map(new Schema({ parse: (input: number) => Ok(input) }), (n) => [n]),
	];

	// When: treating them as AnySchema
	const any: AnySchema[] = schemas;

	// Then: all of them are accepted
	assertEquals(any.length, 3);
});

/** Digit strings as numbers: the parser of {@linkcode digits}. */
function parseDigits(input: string): Result<number, "not digits"> {
	if (/^\d+$/.test(input)) {
		return Ok(Number(input));
	}

	return Err("not digits");
}

const digits = new Schema({ parse: parseDigits });
const laterDigits = new Schema({
	parse: (input: string) => {
		return Promise.resolve(parseDigits(input));
	},
});

/** The error a `parseSync` failure wraps, or `undefined` on success. */
function syncError<I, O, E>(schema: Schema<I, O, E>, input: I): unknown {
	return match(parseSync(schema, input))({
		Ok: () => undefined,
		Err: (error) => union(error),
	});
}

Deno.test("andThen transforms a successful output into its Result", () => {
	// Given: digits, then a fallible halving of even numbers
	const halved = andThen(digits, (n) => {
		if (n % 2 === 0) {
			return Ok(n / 2);
		}

		return Err("odd");
	});

	// When: parsing an even, an odd and a non-digit input
	// Then: next's Ok and Err become the parse's, and self's error passes
	// through
	assertEquals(unwrap(parseSync(halved, "42")), 21);
	assertEquals(syncError(halved, "7"), "odd");
	assertEquals(syncError(halved, "x"), "not digits");
	assertEquals(unionKinds(parse(halved, "42")), "Sync");
});

Deno.test("andThen does not call next when self fails", () => {
	// Given: a next that records each call
	const calls: number[] = [];
	const chained = andThen(digits, (n) => {
		calls.push(n);
		return Ok(n);
	});

	// When: parsing an input self rejects
	parseSync(chained, "x");

	// Then: next never ran
	assertEquals(calls, []);
});

Deno.test("andThen with a promise is async, and parseSync reports it", async () => {
	// Given: a next that resolves later, and a sync next on an async schema
	const fetched = andThen(digits, (n) => Promise.resolve(Ok(n + 1)));
	const afterAsync = andThen(laterDigits, (n) => Ok(n + 1));

	// When: parsing each
	// Then: both parses are Async, parseSync reports UnexpectedAsyncParse, and
	// parseAsync resolves the chained result
	assertEquals(unionKinds(parse(fetched, "1")), "Async");
	assertEquals(unionKinds(parse(afterAsync, "1")), "Async");
	assertEquals(
		unionKinds(unwrapErr(parseSync(fetched, "1"))),
		"UnexpectedAsyncParse",
	);
	assertEquals(unwrap(await parseAsync(fetched, "1")), 2);
	assertEquals(unwrap(await parseAsync(afterAsync, "1")), 2);
	assertEquals(unwrapErr(await parseAsync(afterAsync, "x")), "not digits");
});

Deno.test("andThen accepts enum's main Result from next", () => {
	// Given: a next returning a main Result
	const chained = andThen(digits, (n) => MainOk(n * 2));

	// When: parsing
	// Then: the main Result's value is the output
	assertEquals(unwrap(parseSync(chained, "21")), 42);
});

Deno.test("law: andThen with an Ok-wrapping next equals map", () => {
	// Given: a mapping, applied through map and through andThen
	const double = (n: number): number => n * 2;
	const mapped = map(digits, double);
	const chained = andThen(digits, (n) => Ok(double(n)));

	// When: parsing valid and invalid inputs with both
	// Then: the results are equal
	for (const input of ["0", "21", "x", ""]) {
		assertEquals(parseSync(chained, input), parseSync(mapped, input));
	}
});

Deno.test("andThen panics when next throws", () => {
	// Given: a next that throws
	const broken = andThen(digits, (): Result<number, never> => {
		throw new Error("bug");
	});

	// When: parsing an input self accepts
	// Then: the throw is not caught
	assertThrows(() => parseSync(broken, "1"), Error, "bug");
});

Deno.test("orElse replaces a failure with recover's Result", () => {
	// Given: digits that fall back to 0, and digits that reword their error
	const lenient = orElse(digits, () => Ok(0));
	const reworded = orElse(digits, (error) => Err(`${error}!`));

	// When: parsing a valid and an invalid input
	// Then: a success passes through, and recover's Result replaces a failure
	assertEquals(unwrap(parseSync(lenient, "7")), 7);
	assertEquals(unwrap(parseSync(lenient, "x")), 0);
	assertEquals(syncError(reworded, "x"), "not digits!");
	assertEquals(unionKinds(parse(lenient, "x")), "Sync");
});

Deno.test("orElse does not call recover when self succeeds", () => {
	// Given: a recover that records each call
	const calls: string[] = [];
	const recovered = orElse(digits, (error) => {
		calls.push(error);
		return Ok(0);
	});

	// When: parsing an input self accepts
	parseSync(recovered, "1");

	// Then: recover never ran
	assertEquals(calls, []);
});

Deno.test("orElse with a promise is async", async () => {
	// Given: a recover that resolves later
	const retried = orElse(digits, () => Promise.resolve(Ok(-1)));

	// When: parsing an input self rejects, and one it accepts
	// Then: the failing parse is Async and resolves recover's result, and the
	// successful one stays Sync
	assertEquals(unionKinds(parse(retried, "x")), "Async");
	assertEquals(unwrap(await parseAsync(retried, "x")), -1);
	assertEquals(unionKinds(parse(retried, "1")), "Sync");
});

Deno.test("inspect taps each successful output once, without changing it", async () => {
	// Given: sync and async schemas tapped by inspect
	const seen: number[] = [];
	const record = (n: number): void => {
		seen.push(n);
	};
	const syncTapped = inspect(digits, record);
	const asyncTapped = inspect(laterDigits, record);

	// When: parsing valid and invalid inputs
	const results = [parseSync(syncTapped, "1"), parseSync(syncTapped, "x")];
	const pending = parseAsync(asyncTapped, "2");
	const seenBeforeResolving = [...seen];
	const resolved = await pending;
	await parseAsync(asyncTapped, "y");

	// Then: the tap ran once per success, after the async value was known, and
	// the results are those of the untapped schemas
	assertEquals(results, [parseSync(digits, "1"), parseSync(digits, "x")]);
	assertEquals(resolved, await parseAsync(laterDigits, "2"));
	assertEquals(seenBeforeResolving, [1]);
	assertEquals(seen, [1, 2]);
});

Deno.test("inspectErr taps each error once, without changing it", async () => {
	// Given: sync and async schemas tapped by inspectErr
	const seen: string[] = [];
	const record = (error: string): void => {
		seen.push(error);
	};
	const syncTapped = inspectErr(digits, record);
	const asyncTapped = inspectErr(laterDigits, record);

	// When: parsing valid and invalid inputs
	const results = [parseSync(syncTapped, "1"), parseSync(syncTapped, "x")];
	const pending = parseAsync(asyncTapped, "y");
	const seenBeforeResolving = [...seen];
	const resolved = await pending;
	await parseAsync(asyncTapped, "2");

	// Then: the tap ran once per failure, after the async error was known, and
	// the results are those of the untapped schemas
	assertEquals(results, [parseSync(digits, "1"), parseSync(digits, "x")]);
	assertEquals(resolved, await parseAsync(laterDigits, "y"));
	assertEquals(seenBeforeResolving, ["not digits"]);
	assertEquals(seen, ["not digits", "not digits"]);
});

Deno.test("preprocess transforms the input before parsing", () => {
	// Given: digits that trim their input first
	const trimmed = preprocess(digits, (input: string) => input.trim());

	// When: parsing padded valid and invalid inputs
	// Then: digits parsed the trimmed input, synchronously
	assertEquals(unwrap(parseSync(trimmed, " 42 ")), 42);
	assertEquals(syncError(trimmed, " x "), "not digits");
	assertEquals(unionKinds(parse(trimmed, "1")), "Sync");
});

Deno.test("preprocess with a promise is async", async () => {
	// Given: a prepare that resolves later
	const fetched = preprocess(digits, (input: number) => {
		return Promise.resolve(String(input));
	});

	// When: parsing
	// Then: the parse is Async and resolves the prepared input's result
	assertEquals(unionKinds(parse(fetched, 7)), "Async");
	assertEquals(unwrap(await parseAsync(fetched, 7)), 7);
});

Deno.test("law: preprocess with the identity equals the schema", () => {
	// Given: digits preprocessed with the identity
	const same = preprocess(digits, (input: string) => input);

	// When: parsing valid and invalid inputs with both
	// Then: the results are equal
	for (const input of ["0", "21", "x", ""]) {
		assertEquals(parseSync(same, input), parseSync(digits, input));
	}
});

Deno.test("the Result-style transforms' types", () => {
	// Given: schemas built with each transform
	const chained = andThen(digits, (n) => {
		if (n > 0) {
			return Ok<string, "not positive">(String(n));
		}

		return Err<string, "not positive">("not positive");
	});
	const recovered = orElse(digits, () => Ok<number, "unrecoverable">(0));
	const tapped = inspect(digits, () => {});
	const tappedErr = inspectErr(digits, () => {});
	const prepared = preprocess(digits, (input: number) => String(input));

	// When: reading their types
	// Then: andThen adds next's error, orElse replaces the error, the taps
	// keep every type, and preprocess changes only the input
	assertType<IsExact<Output<typeof chained>, string>>(true);
	assertType<IsExact<ErrorOf<typeof chained>, "not digits" | "not positive">>(
		true,
	);
	assertType<IsExact<Output<typeof recovered>, number>>(true);
	assertType<IsExact<ErrorOf<typeof recovered>, "unrecoverable">>(true);
	assertType<
		IsExact<typeof tapped, typeof digits & TransformView<typeof digits>>
	>(true);
	assertType<
		IsExact<typeof tappedErr, typeof digits & TransformView<typeof digits>>
	>(true);
	assertType<IsExact<Input<typeof prepared>, number>>(true);
	assertType<IsExact<Output<typeof prepared>, number>>(true);
	assertType<IsExact<ErrorOf<typeof prepared>, "not digits">>(true);
});

Deno.test("every transform views the schema it parses with, and pipe both", () => {
	// Given: a schema, and one to pipe its output to
	const text = new Schema({
		parse: (input: string) => Ok<string, string>(input),
	});
	const length = new Schema({
		parse: (input: string) => Ok<number, string>(input.length),
	});

	// When: transforming it each way
	const transforms = [
		map(text, (value) => value),
		mapErr(text, (error) => error),
		filter(text, {
			error: (value) => value,
			predicate: (value): value is string => value !== "",
		}),
		andThen(text, (value) => Ok(value)),
		orElse(text, (error) => Err(error)),
		inspect(text, () => {}),
		inspectErr(text, () => {}),
		preprocess(text, (input: string) => input),
	];
	const piped = pipe(text, length);

	// Then: each .inner is the schema itself, and the pipe's .next is length
	for (const transform of transforms) {
		assertStrictEquals(transform.inner, text);
	}
	assertStrictEquals(piped.inner, text);
	assertStrictEquals(piped.next, length);
	assertType<IsExact<typeof piped.next, typeof length>>(true);
});
