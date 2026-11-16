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
import {
	from,
	type MaybePromise,
	map as mapPotential,
	type Potential,
} from "./potential.ts";

/**
 * A parser function that validates and transforms input into output.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 */
export type Parser<I, O, E> = (input: I) => MaybePromise<Result<O, E>>;

/**
 * A schema that validates and transforms input values.
 *
 * Schemas are composable validation units that can parse, transform,
 * and validate data. They support both synchronous and asynchronous validation.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 */
export class Schema<I, O, E> extends Struct<Parser<I, O, E>> {}

/**
 * Any schema: every `Schema<I, O, E>` is assignable to it. Use it to
 * constrain a type parameter that takes a schema, such as a composite's
 * children.
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { type AnySchema, Schema } from "@sekhmet/schema/core/mini/schema";
 *
 * const schemas: AnySchema[] = [
 * 	new Schema((input: string) => Ok(input.length)),
 * 	new Schema((input: unknown) => Ok(input)),
 * ];
 * ```
 */
export type AnySchema = Schema<never, unknown, unknown>;

/**
 * The input type a schema accepts.
 *
 * @template S The schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Input, Schema } from "@sekhmet/schema/core/mini/schema";
 *
 * assertType<IsExact<Input<Schema<string, number, Error>>, string>>(true);
 * ```
 */
export type Input<S extends AnySchema> =
	S extends Schema<infer I, infer _O, infer _E> ? I : never;

/**
 * The output type a schema produces on success.
 *
 * @template S The schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Output, Schema } from "@sekhmet/schema/core/mini/schema";
 *
 * assertType<IsExact<Output<Schema<string, number, Error>>, number>>(true);
 * ```
 */
export type Output<S extends AnySchema> =
	S extends Schema<infer _I, infer O, infer _E> ? O : never;

/**
 * The type a schema infers for a valid value: an alias of
 * {@linkcode Output}.
 *
 * @template S The schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Infer, Schema } from "@sekhmet/schema/core/mini/schema";
 *
 * assertType<IsExact<Infer<Schema<string, number, Error>>, number>>(true);
 * ```
 */
export type Infer<S extends AnySchema> = Output<S>;

/**
 * The error type a schema fails with.
 *
 * @template S The schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ErrorOf, Schema } from "@sekhmet/schema/core/mini/schema";
 *
 * assertType<IsExact<ErrorOf<Schema<string, number, Error>>, Error>>(true);
 * ```
 */
export type ErrorOf<S extends AnySchema> =
	S extends Schema<infer _I, infer _O, infer E> ? E : never;

/**
 * Parses input using a schema, returning a Potential result.
 *
 * This function handles both synchronous and asynchronous parsing,
 * wrapping the result in a Potential to indicate timing.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema to use for parsing
 * @param input The input to parse
 * @returns A Potential containing the parse result
 */
export function parse<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Potential<Result<O, E>> {
	return from(getStructParams(self)(input));
}

/**
 * Error variants that can occur during synchronous parsing.
 *
 * @template E The underlying parse error type
 */
export type ParseSyncErrorVariants<E> = Split<{
	UnexpectedAsyncParse: [];
	ParseError: [error: E];
}>;

/**
 * An error that occurs during synchronous parsing.
 *
 * This can be either an unexpected async parse (when sync was required)
 * or a wrapped parse error from the schema.
 *
 * @template E The underlying parse error type
 */
export class ParseSyncError<E> extends Enum<ParseSyncErrorVariants<E>> {}

/**
 * Creates an UnexpectedAsyncParse error.
 *
 * This error indicates that a schema required asynchronous parsing
 * when only synchronous parsing was allowed.
 *
 * @template E The underlying parse error type
 * @returns A ParseSyncError variant
 */
export function UnexpectedAsyncParse<E>(): ParseSyncError<E> {
	return new ParseSyncError("UnexpectedAsyncParse");
}

/**
 * Wraps a parse error in a ParseSyncError.
 *
 * @template E The parse error type
 * @param error The error to wrap
 * @returns A ParseSyncError variant
 */
export function ParseError<E>(error: E): ParseSyncError<E> {
	return new ParseSyncError("ParseError", error);
}

/**
 * Parses input synchronously, failing if async parsing is required.
 *
 * This function will return an error if the schema requires asynchronous
 * validation. Use this when you need guaranteed synchronous parsing.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema to use for parsing
 * @param input The input to parse
 * @returns A Result that is either the output or a ParseSyncError
 */
export function parseSync<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Result<O, ParseSyncError<E>> {
	return match(parse(self, input))({
		Sync: (result) => mapErrResult(result, (error) => ParseError(error)),
		Async: () => Err(UnexpectedAsyncParse()),
	});
}

/**
 * Parses input asynchronously, handling both sync and async schemas.
 *
 * This function always returns a Promise, converting synchronous
 * parse results to promises for consistency.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema to use for parsing
 * @param input The input to parse
 * @returns A Promise of the parse result
 */
export function parseAsync<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Promise<Result<O, E>> {
	return match(parse(self, input))({
		Sync: (result) => Promise.resolve(result),
		Async: (promisedResult) => promisedResult,
	});
}

/**
 * Maps a schema's output through a transformation function.
 *
 * This creates a new schema that first parses with the original schema,
 * then applies the mapping function to successful results.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The error type
 * @template P The mapped output type
 * @param self The schema to map
 * @param mapping The transformation function
 * @returns A new schema with transformed output
 */
export function map<I, O, E, P>(
	self: Schema<I, O, E>,
	mapping: (output: O) => P,
): Schema<I, P, E> {
	return new Schema((input) => {
		const potentialResult = parse(self, input);

		return union(
			mapPotential(potentialResult, (result) => {
				return mapResult(result, mapping);
			}),
		);
	});
}

/**
 * Maps a schema's error through a transformation function.
 *
 * This creates a new schema that transforms any errors produced
 * by the original schema using the provided mapping function.
 *
 * @template I The input type
 * @template O The output type
 * @template E The original error type
 * @template F The mapped error type
 * @param self The schema to map
 * @param mapping The error transformation function
 * @returns A new schema with transformed errors
 */
export function mapErr<I, O, E, F>(
	self: Schema<I, O, E>,
	mapping: (error: E) => F,
): Schema<I, O, F> {
	return new Schema((input) => {
		const potentialResult = parse(self, input);

		return union(
			mapPotential(potentialResult, (result) => {
				return mapErrResult(result, mapping);
			}),
		);
	});
}

/**
 * Chains two schemas together in a pipeline.
 *
 * The output of the first schema becomes the input to the second schema.
 * If the first schema fails, the error is propagated without running the second schema.
 *
 * @template I The input type
 * @template O The intermediate output type
 * @template E The error type (shared between both schemas)
 * @template P The final output type
 * @param self The first schema
 * @param nextSchema The second schema to apply to successful results
 * @returns A new schema representing the pipeline
 */
export function pipe<I, O, E, P>(
	self: Schema<I, O, E>,
	nextSchema: Schema<O, P, E>,
): Schema<I, P, E> {
	return new Schema((input) => {
		return match(parse(self, input))({
			Sync: (result) => handleResult(result),
			Async: async (promisedResult) => handleResult(await promisedResult),
		});
	});

	function handleResult(result: Result<O, E>): MaybePromise<Result<P, E>> {
		return match(result)({
			Ok: (output) => getStructParams(nextSchema)(output),
			Err: (error) => Err(error),
		});
	}
}

/**
 * Filters a schema's output using a type guard predicate.
 *
 * This creates a new schema that only succeeds if the original schema succeeds
 * AND the filtering predicate returns true. Failed filters return the provided error.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The error type
 * @template P The filtered output type (must be a subtype of O)
 * @param self The schema to filter
 * @param error The error to return if the filter fails
 * @param filtering The type guard predicate
 * @returns A new schema with filtered output
 */
export function filter<I, O, E, P extends O>(
	self: Schema<I, O, E>,
	error: E,
	filtering: (output: O) => output is P,
): Schema<I, P, E> {
	return new Schema((input) => {
		return match(parse(self, input))<MaybePromise<Result<P, E>>>({
			Sync: (result) => handleResult(result),
			Async: async (promisedResult) => handleResult(await promisedResult),
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
