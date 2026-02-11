import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, mapErr, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { assertEquals } from "@std/assert";

function Sync<T>(value: T): Potential<T> {
	return new Potential<T>("Sync", value);
}

function Async<T>(promise: Promise<T>): Potential<T> {
	return new Potential<T>("Async", promise);
}

type PotentialVariants<T> = Split<{
	Sync: [value: T];
	Async: [promise: Promise<T>];
}>;

class Potential<T> extends Enum<PotentialVariants<T>> {}

function from<T>(value: T | Promise<T>): Potential<T> {
	if (value instanceof Promise) {
		return Async(value);
	}

	return Sync(value);
}

type Parser<I, O, E> = (input: I) => Result<O, E> | Promise<Result<O, E>>;

class Schema<I, O, E> extends Struct<Parser<I, O, E>> {}

function parse<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Potential<Result<O, E>> {
	return from(getStructParams(self)(input));
}

function UnexpectedAsyncParse<E>(): ParseSyncError<E> {
	return new ParseSyncError("UnexpectedAsyncParse");
}

function ParseError<E>(error: E): ParseSyncError<E> {
	return new ParseSyncError("ParseError", error);
}

type ParseSyncErrorVariants<E> = Split<{
	UnexpectedAsyncParse: [];
	ParseError: [error: E];
}>;

class ParseSyncError<E> extends Enum<ParseSyncErrorVariants<E>> {}

function parseSync<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Result<O, ParseSyncError<E>> {
	return match(parse(self, input))({
		Sync: (result) => mapErr(result, (error) => ParseError(error)),
		Async: () => Err(UnexpectedAsyncParse()),
	});
}

function parseAsync<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Promise<Result<O, E>> {
	return match(parse(self, input))({
		Sync: (result) => Promise.resolve(result),
		Async: (promisedResult) => promisedResult,
	});
}

Deno.test("Lab test", () => {
	assertEquals(1 + 1, 2);
});
