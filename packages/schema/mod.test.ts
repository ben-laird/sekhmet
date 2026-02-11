import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match, union } from "@sekhmet/enum/core/mini/exit";
import {
	Err,
	mapErr as mapErrResult,
	map as mapResult,
	Ok,
	type Result,
} from "@sekhmet/enum/result/mini";
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

function mapPotential<T, U>(
	self: Potential<T>,
	mapping: (value: T) => U | Promise<U>,
): Potential<U> {
	return match(self)({
		Sync: (value) => from(mapping(value)),
		Async: (promisedValue) => {
			return from(promisedValue.then((value) => mapping(value)));
		},
	});
}

type Parser<I, O, E> = (input: I) => Potential<Result<O, E>>;

class Schema<I, O, E> extends Struct<Parser<I, O, E>> {}

function parse<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Potential<Result<O, E>> {
	return getStructParams(self)(input);
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
		Sync: (result) => mapErrResult(result, (error) => ParseError(error)),
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

function map<I, O, E, P>(
	self: Schema<I, O, E>,
	mapping: (output: O) => P,
): Schema<I, P, E> {
	return new Schema((input) => {
		const potentialResult = parse(self, input);

		return mapPotential(potentialResult, (result) => {
			return mapResult(result, mapping);
		});
	});
}

function mapErr<I, O, E, F>(
	self: Schema<I, O, E>,
	mapping: (error: E) => F,
): Schema<I, O, F> {
	return new Schema((input) => {
		const potentialResult = parse(self, input);

		return mapPotential(potentialResult, (result) => {
			return mapErrResult(result, mapping);
		});
	});
}

function pipe<I, O, E, P>(
	self: Schema<I, O, E>,
	nextSchema: Schema<O, P, E>,
): Schema<I, P, E> {
	return new Schema((input) => {
		return match(parse(self, input))({
			Sync: (result) => {
				return match(result)({
					Ok: (output) => parse(nextSchema, output),
					Err: (error) => Sync(Err(error)),
				});
			},
			Async: (promisedResult) => {
				return Async(
					promisedResult.then((result) => {
						return match(result)({
							Ok: (output) => union(parse(nextSchema, output)),
							Err: (error) => Err(error),
						});
					}),
				);
			},
		});
	});
}

function filter<I, O, E, P extends O>(
	self: Schema<I, O, E>,
	error: E,
	filtering: (output: O) => output is P,
): Schema<I, P, E> {
	return new Schema((input) => {
		return match(parse(self, input))({
			Sync: (result) => {
				return Sync(handleResult(result));
			},
			Async: (promisedResult) => {
				return Async(promisedResult.then((result) => handleResult(result)));
			},
		});
	});

	function handleResult(result: Result<O, E>): Result<P, E> {
		return match(result)({
			Ok: (output) => {
				if (filtering(output)) {
					return Ok(output);
				}

				return Err(error);
			},
			Err,
		});
	}
}

Deno.test("Lab test", () => {
	assertEquals(1 + 1, 2);
});
