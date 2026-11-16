import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match, union } from "@sekhmet/enum/core/mini/exit";
import {
	Err,
	inspectErr as inspectErrResult,
	inspect as inspectResult,
	mapErr as mapErrResult,
	map as mapResult,
	Ok,
	type Result,
} from "@sekhmet/enum/result/mini";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import type { Annotation } from "./annotation.ts";
import { Opaque, SchemaNode, type TransformStep } from "./node.ts";
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
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import type { Parser } from "@sekhmet/schema/core/mini";
 *
 * const length: Parser<string, number, never> = (input) => Ok(input.length);
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const even = new Schema({
 * 	parse: (input: number) => {
 * 		return input % 2 === 0 ? Ok(input) : Err("odd");
 * 	},
 * });
 *
 * assertEquals(unwrap(parseSync(even, 4)), 4);
 * ```
 */
export class Schema<I, O, E> extends Struct<SchemaParams<I, O, E>> {
	/**
	 * Builds a schema from its parser, and optionally its node and
	 * annotations.
	 *
	 * @param init The parser, the node (default `Opaque()`) and the
	 *   annotations (default none)
	 */
	constructor(init: SchemaInit<I, O, E>) {
		super({
			parse: init.parse,
			node: init.node ?? Opaque(),
			annotations: init.annotations ?? [],
		});
	}
}

/**
 * What a {@linkcode Schema} holds: how it parses, what it is as data, and
 * its metadata. Read with `getStructParams`; every field is immutable.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { getStructParams } from "@sekhmet/primordials/struct";
 * import { Schema, type SchemaParams } from "@sekhmet/schema/core/mini";
 *
 * const params: SchemaParams<unknown, unknown, never> = getStructParams(
 * 	new Schema({ parse: (input: unknown) => Ok(input) }),
 * );
 *
 * assertEquals(unionKinds(params.node), "Opaque");
 * assertEquals(params.annotations, []);
 * ```
 */
export interface SchemaParams<I, O, E> {
	/** Parses an input. */
	readonly parse: Parser<I, O, E>;
	/** What the schema is, as data (see {@linkcode SchemaNode}). */
	readonly node: SchemaNode;
	/** The schema's annotations, in order; a later one for a key wins. */
	readonly annotations: readonly Annotation[];
}

/**
 * What `new Schema(…)` takes: the parser, and optionally the schema's node
 * and annotations. A schema that names no node is `Opaque`, and one that
 * names no annotations has none. Under `exactOptionalPropertyTypes`, an
 * omitted field is left out, not set to `undefined`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { Schema, type SchemaInit } from "@sekhmet/schema/core/mini";
 *
 * const init: SchemaInit<string, number, never> = {
 * 	parse: (input) => Ok(input.length),
 * };
 * const length = new Schema(init);
 * ```
 */
export interface SchemaInit<I, O, E> {
	/** Parses an input. */
	readonly parse: Parser<I, O, E>;
	/**
	 * What the schema is, as data.
	 *
	 * @default Opaque()
	 */
	readonly node?: SchemaNode;
	/**
	 * The schema's annotations.
	 *
	 * @default []
	 */
	readonly annotations?: readonly Annotation[];
}

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
 * 	new Schema({ parse: (input: string) => Ok(input.length) }),
 * 	new Schema({ parse: (input: unknown) => Ok(input) }),
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { parse, Schema } from "@sekhmet/schema/core/mini";
 *
 * const now = new Schema({ parse: (input: string) => Ok(input) });
 * const later = new Schema({ parse: (input: string) => Promise.resolve(Ok(input)) });
 *
 * assertEquals(unionKinds(parse(now, "a")), "Sync");
 * assertEquals(unionKinds(parse(later, "a")), "Async");
 * ```
 */
export function parse<I, O, E>(
	self: Schema<I, O, E>,
	input: I,
): Potential<Result<O, E>> {
	return from(getStructParams(self).parse(input));
}

/**
 * Error variants that can occur during synchronous parsing.
 *
 * @template E The underlying parse error type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ParseSyncErrorVariants } from "@sekhmet/schema/core/mini";
 *
 * type Variants = ParseSyncErrorVariants<string>;
 * assertType<IsExact<Variants, [kind: "UnexpectedAsyncParse"] | [kind: "ParseError", error: string]>>(true);
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 * import { ParseError } from "@sekhmet/schema/core/mini";
 *
 * const message = match(ParseError("odd"))({
 * 	UnexpectedAsyncParse: () => "the schema is async",
 * 	ParseError: (error) => `rejected: ${error}`,
 * });
 * assertEquals(message, "rejected: odd");
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { UnexpectedAsyncParse } from "@sekhmet/schema/core/mini";
 *
 * assertEquals(unionKinds(UnexpectedAsyncParse()), "UnexpectedAsyncParse");
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { ParseError } from "@sekhmet/schema/core/mini";
 *
 * assertEquals(union(ParseError("odd")), "odd");
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const now = new Schema({ parse: (input: string) => Ok(input) });
 * const later = new Schema({ parse: (input: string) => Promise.resolve(Ok(input)) });
 *
 * assertEquals(unwrap(parseSync(now, "a")), "a");
 * assertEquals(unionKinds(unwrapErr(parseSync(later, "a"))), "UnexpectedAsyncParse");
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const later = new Schema({ parse: (input: string) => Promise.resolve(Ok(input)) });
 *
 * assertEquals(unwrap(await parseAsync(later, "a")), "a");
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { map, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const length = map(text, (value) => value.length);
 *
 * assertEquals(unwrap(parseSync(length, "four")), 4);
 * ```
 */
export function map<I, O, E, P>(
	self: Schema<I, O, E>,
	mapping: (output: O) => P,
): Schema<I, P, E> {
	return continueWith({
		step: "map",
		schema: self,
		next: (result) => mapResult(result, mapping),
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { Err, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { mapErr, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const reject = new Schema({ parse: (_input: string) => Err(404) });
 * const described = mapErr(reject, (code) => `error ${code}`);
 *
 * assertEquals(union(unwrapErr(parseSync(described, "a"))), "error 404");
 * ```
 */
export function mapErr<I, O, E, F>(
	self: Schema<I, O, E>,
	mapping: (error: E) => F,
): Schema<I, O, F> {
	return continueWith({
		step: "mapErr",
		schema: self,
		next: (result) => mapErrResult(result, mapping),
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync, pipe, Schema } from "@sekhmet/schema/core/mini";
 *
 * const digits = new Schema({
 * 	parse: (input: string) => {
 * 		return /^\d+$/.test(input) ? Ok(input) : Err("not digits");
 * 	},
 * });
 * const integer = new Schema({ parse: (input: string) => Ok(Number(input)) });
 *
 * assertEquals(unwrap(parseSync(pipe(digits, integer), "42")), 42);
 * ```
 */
export function pipe<I, O, E, P>(
	self: Schema<I, O, E>,
	nextSchema: Schema<O, P, E>,
): Schema<I, P, E> {
	const next = getStructParams(nextSchema).parse;

	return new Schema({
		parse: (input) => {
			return union(
				mapPotential(parse(self, input), (result) => {
					return match(result)<MaybePromise<Result<P, E>>>({
						Ok: next,
						Err: (error) => Err(error),
					});
				}),
			);
		},
		node: new SchemaNode("Pipe", { inner: self, next: nextSchema }),
	});
}

/**
 * How {@linkcode filter} checks an output: the type guard it must pass, and
 * the error it fails with otherwise.
 *
 * @template O The output type
 * @template E The error type
 * @template P The filtered output type (a subtype of O)
 *
 * @example
 * ```ts
 * import type { FilterOptions } from "@sekhmet/schema/core/mini";
 *
 * const positive: FilterOptions<number, string, number> = {
 * 	error: "not positive",
 * 	predicate: (n): n is number => n > 0,
 * };
 * ```
 */
export interface FilterOptions<O, E, P extends O> {
	/** The error a parse fails with when the output fails `predicate`. */
	readonly error: E;
	/** The type guard each output must pass. */
	readonly predicate: (output: O) => output is P;
}

/**
 * Filters a schema's output using a type guard predicate.
 *
 * This creates a new schema that only succeeds if the original schema succeeds
 * AND the predicate returns true. A failed filter returns the given error.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The error type
 * @template P The filtered output type (must be a subtype of O)
 * @param self The schema to filter
 * @param options The type guard predicate, and the error when it fails
 * @returns A new schema with filtered output
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { filter, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const integer = new Schema({ parse: (input: number) => Ok<number, string>(input) });
 * const positive = filter(integer, {
 * 	error: "not positive",
 * 	predicate: (n): n is number => n > 0,
 * });
 *
 * assertEquals(union(unwrapErr(parseSync(positive, -1))), "not positive");
 * ```
 */
export function filter<I, O, E, P extends O>(
	self: Schema<I, O, E>,
	options: FilterOptions<O, E, P>,
): Schema<I, P, E> {
	const { error, predicate } = options;

	return continueWith({
		step: "filter",
		schema: self,
		next: (result) => {
			return match(result)<Result<P, E>>({
				Ok: (output) => (predicate(output) ? Ok(output) : Err(error)),
				Err: (failure) => Err(failure),
			});
		},
	});
}

/**
 * How {@linkcode continueWith} extends a schema: which transform it is, the
 * schema to parse with, and the step each of its results goes through.
 */
interface Continuation<I, O, E, P, F> {
	readonly step: TransformStep;
	readonly schema: Schema<I, O, E>;
	readonly next: (result: Result<O, E>) => MaybePromise<Result<P, F>>;
}

/**
 * A schema that parses with `schema`, then passes the result to `next`,
 * recorded as a `Transform` node of `step`. The parse stays sync when both
 * are; a promise from either makes it async.
 */
function continueWith<I, O, E, P, F>(
	continuation: Continuation<I, O, E, P, F>,
): Schema<I, P, F> {
	const { step, schema, next } = continuation;

	return new Schema({
		parse: (input) => union(mapPotential(parse(schema, input), next)),
		node: new SchemaNode("Transform", { step, inner: schema }),
	});
}

/**
 * Chains a fallible transform onto a schema's output, like Result's
 * `andThen`: convert or validate in code.
 *
 * On success, the output goes to `next`, whose `Result` becomes the parse's;
 * a failure passes through without calling it. `next` may return enum's main
 * or mini `Result`, or a promise of one, which makes the parse `Async` (and
 * `parseSync` then reports `UnexpectedAsyncParse`). A `next` that throws
 * panics: the throw is not caught, as with {@linkcode map}.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The original error type
 * @template P The new output type
 * @template F The error type `next` may add
 * @param self The schema whose output to transform
 * @param next The fallible transform for each successful output: a
 * {@linkcode Parser} from the output
 * @returns A new schema whose output is `next`'s, failing with either error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { andThen, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const integer = andThen(text, (value) => {
 * 	const parsed = Number.parseInt(value, 10);
 * 	return Number.isNaN(parsed) ? Err("not an integer") : Ok(parsed);
 * });
 *
 * assertEquals(unwrap(parseSync(integer, "42")), 42);
 * assertEquals(union(unwrapErr(parseSync(integer, "x"))), "not an integer");
 * ```
 */
export function andThen<I, O, E, P, F>(
	self: Schema<I, O, E>,
	next: Parser<O, P, F>,
): Schema<I, P, E | F> {
	return continueWith({
		step: "andThen",
		schema: self,
		next: (result) => {
			return match(result)<MaybePromise<Result<P, E | F>>>({
				Ok: next,
				Err: (error) => Err(error),
			});
		},
	});
}

/**
 * Recovers from a schema's failure, like Result's `orElse`: fall back to
 * another value, or retry another way.
 *
 * On failure, the error goes to `recover`, whose `Result` becomes the parse's;
 * a success passes through without calling it. `recover` may return enum's
 * main or mini `Result`, or a promise of one, which makes the parse `Async`
 * (and `parseSync` then reports `UnexpectedAsyncParse`). A `recover` that
 * throws panics: the throw is not caught, as with {@linkcode mapErr}.
 *
 * @template I The input type
 * @template O The output type
 * @template E The original error type
 * @template F The error type after recovery
 * @param self The schema whose failures to recover from
 * @param recover The fallback for each error: a {@linkcode Parser} from
 * the error
 * @returns A new schema that fails only with `recover`'s error
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { orElse, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const port = new Schema({
 * 	parse: (input: string) => {
 * 		if (/^\d+$/.test(input)) {
 * 			return Ok<number, string>(Number(input));
 * 		}
 *
 * 		return Err<number, string>("not a port");
 * 	},
 * });
 * const withDefault = orElse(port, () => Ok(8080));
 *
 * assertEquals(unwrap(parseSync(withDefault, "3000")), 3000);
 * assertEquals(unwrap(parseSync(withDefault, "")), 8080);
 * ```
 */
export function orElse<I, O, E, F>(
	self: Schema<I, O, E>,
	recover: Parser<E, O, F>,
): Schema<I, O, F> {
	return continueWith({
		step: "orElse",
		schema: self,
		next: (result) => {
			return match(result)<MaybePromise<Result<O, F>>>({
				Ok: (output) => Ok(output),
				Err: recover,
			});
		},
	});
}

/**
 * Taps a schema's successful outputs for a side effect (logging, metrics),
 * like Result's `inspect`; the result passes through unchanged.
 *
 * `inspector` runs once per successful parse, after the output is known
 * (when an `Async` parse resolves), and never on failure. An `inspector`
 * that throws panics: the throw is not caught.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema whose outputs to tap
 * @param inspector The side effect for each successful output
 * @returns A new schema with the same results as `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { inspect, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const seen: string[] = [];
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const logged = inspect(text, (value) => {
 * 	seen.push(value);
 * });
 *
 * parseSync(logged, "a");
 * assertEquals(seen, ["a"]);
 * ```
 */
export function inspect<I, O, E>(
	self: Schema<I, O, E>,
	inspector: (output: O) => void,
): Schema<I, O, E> {
	return continueWith({
		step: "inspect",
		schema: self,
		next: (result) => {
			inspectResult(result, inspector);
			return result;
		},
	});
}

/**
 * Taps a schema's errors for a side effect (logging, metrics), like Result's
 * `inspectErr`; the result passes through unchanged.
 *
 * `inspector` runs once per failed parse, after the error is known (when an
 * `Async` parse resolves), and never on success. An `inspector` that throws
 * panics: the throw is not caught.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema whose errors to tap
 * @param inspector The side effect for each error
 * @returns A new schema with the same results as `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err } from "@sekhmet/enum/result/mini";
 * import { inspectErr, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const seen: string[] = [];
 * const reject = new Schema({ parse: (_input: string) => Err("rejected") });
 * const logged = inspectErr(reject, (error) => {
 * 	seen.push(error);
 * });
 *
 * parseSync(logged, "a");
 * assertEquals(seen, ["rejected"]);
 * ```
 */
export function inspectErr<I, O, E>(
	self: Schema<I, O, E>,
	inspector: (error: E) => void,
): Schema<I, O, E> {
	return continueWith({
		step: "inspectErr",
		schema: self,
		next: (result) => {
			inspectErrResult(result, inspector);
			return result;
		},
	});
}

/**
 * Transforms the input before a schema parses it: the dual of
 * {@linkcode map}, like Zod's `z.preprocess`.
 *
 * `prepare` turns each input into the one `self` parses; it cannot fail
 * (fail in `self`, or use {@linkcode andThen} after it). A promise from
 * `prepare` makes the parse `Async` (and `parseSync` then reports
 * `UnexpectedAsyncParse`). A `prepare` that throws panics: the throw is not
 * caught, as with {@linkcode map}.
 *
 * @template J The new input type
 * @template I The input type `self` parses
 * @template O The output type
 * @template E The error type
 * @param self The schema to parse the prepared input with
 * @param prepare The transform from the new input to `self`'s input
 * @returns A new schema that accepts `prepare`'s input
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync, preprocess, Schema } from "@sekhmet/schema/core/mini";
 *
 * const digits = new Schema({
 * 	parse: (input: string) => {
 * 		if (/^\d+$/.test(input)) {
 * 			return Ok<number, string>(Number(input));
 * 		}
 *
 * 		return Err<number, string>("not digits");
 * 	},
 * });
 * const trimmed = preprocess(digits, (input: string) => input.trim());
 *
 * assertEquals(unwrap(parseSync(trimmed, " 42 ")), 42);
 * ```
 */
export function preprocess<J, I, O, E>(
	self: Schema<I, O, E>,
	prepare: (input: J) => MaybePromise<I>,
): Schema<J, O, E> {
	const parser = getStructParams(self).parse;

	return new Schema({
		parse: (input) => union(mapPotential(from(prepare(input)), parser)),
		node: new SchemaNode("Transform", { step: "preprocess", inner: self }),
	});
}
