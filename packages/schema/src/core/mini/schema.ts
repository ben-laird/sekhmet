/**
 * The {@linkcode Schema} type and its core API: running a schema
 * ({@linkcode parse} under a panic runtime, {@linkcode parseSync}),
 * transforming one ({@linkcode map}, {@linkcode mapErr}, {@linkcode pipe},
 * {@linkcode filter}, {@linkcode andThen}, {@linkcode orElse},
 * {@linkcode inspect}, {@linkcode inspectErr}, {@linkcode preprocess}), and its
 * type helpers ({@linkcode Input}, {@linkcode Output}, {@linkcode Infer},
 * {@linkcode ErrorOf}, {@linkcode ParseSyncError}).
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import {
	Err,
	inspectErr as inspectErrResult,
	inspect as inspectResult,
	mapErr as mapErrResult,
	map as mapResult,
	Ok,
	type Result,
} from "@sekhmet/enum/result/mini";
import type { PanicRuntime } from "@sekhmet/panic/mini/runtime";
import {
	type Outcome,
	Ok as OutcomeOk,
	Panicked,
} from "@sekhmet/panic/outcome/mini/core";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import type { Vow } from "@sekhmet/vow/mini/core";
import type { Annotation } from "./annotation.ts";
import { Opaque, SchemaNode, type TransformStep } from "./node.ts";
import { guard, isPromiseLike, proceed, settled, step } from "./parsing.ts";
import { type PipeView, type TransformView, viewed } from "./view.ts";

/**
 * A value, or a promise-like (any thenable) of that value.
 *
 * @template T The type of the value
 *
 * @example
 * ```ts
 * import type { MaybePromise } from "@sekhmet/schema/core/mini";
 *
 * const now: MaybePromise<number> = 1;
 * const later: MaybePromise<number> = Promise.resolve(1);
 * ```
 */
export type MaybePromise<T> = T | PromiseLike<T>;

/**
 * A parser function that validates and transforms input into output: user
 * code, returning a `Result` or a promise of one.
 *
 * A parser that throws, or whose promise rejects, panics: {@linkcode parse}
 * catches it at its panic boundary and settles as `Panicked`. An expected
 * failure is an `Err`.
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
 * The part of a panic runtime a parse runs user code under: its
 * `catchUnwind` and `catchUnwindAsync`. Every `PanicRuntime` from
 * `definePanicRuntime()` is one.
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import type { PanicBoundary } from "@sekhmet/schema/core/mini";
 *
 * const panics: PanicBoundary = definePanicRuntime();
 * ```
 */
export type PanicBoundary = Pick<
	PanicRuntime,
	"catchUnwind" | "catchUnwindAsync"
>;

/**
 * What {@linkcode parse} takes: the input, and the panic runtime its user
 * code (parsers, refinements, transforms) runs under.
 *
 * @template I The input type
 *
 * @example
 * ```ts
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import type { ParseOptions } from "@sekhmet/schema/core/mini";
 *
 * const options: ParseOptions<string> = {
 * 	input: "a",
 * 	panics: definePanicRuntime(),
 * };
 * ```
 */
export interface ParseOptions<I> {
	/** The input to parse. */
	readonly input: I;
	/** The panic runtime a throw or rejection in user code is caught by. */
	readonly panics: PanicBoundary;
}

/**
 * How a schema runs under a panic boundary: from {@linkcode ParseOptions}
 * to a `Vow` of the parse's `Outcome`. It is what a schema holds
 * ({@linkcode SchemaParams}); `new Schema({ parse })` builds one from a
 * {@linkcode Parser}, and a composite builds its own (`new Schema({ run })`)
 * from its children's {@linkcode parse}.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { parse, parseSync, type Runner, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const traced: Runner<string, string, never> = (options) => parse(text, options);
 *
 * assertEquals(unwrap(parseSync(new Schema({ run: traced }), "a")), "a");
 * ```
 */
export type Runner<I, O, E> = (
	options: ParseOptions<I>,
) => Vow<Outcome<O, E, unknown>>;

/**
 * A schema that validates and transforms input values.
 *
 * Schemas are composable validation units that can parse, transform,
 * and validate data. A parse settles synchronously when every step of it
 * is synchronous, and later otherwise (see {@linkcode parse}).
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
	 * Builds a schema from its parser (or its runner), and optionally its
	 * node and annotations.
	 *
	 * @param init The parser or runner, the node (default `Opaque()`) and
	 *   the annotations (default none)
	 */
	constructor(init: SchemaInit<I, O, E>) {
		super({
			run: runnerOf(init),
			node: init.node ?? Opaque(),
			annotations: init.annotations ?? [],
		});
	}
}

/** The runner a schema's init describes: its own, or its parser's, guarded. */
function runnerOf<I, O, E>(init: SchemaInit<I, O, E>): Runner<I, O, E> {
	if (init.run !== undefined) return init.run;

	const parser = init.parse;

	return ({ input, panics }) => guard({ panics, work: () => parser(input) });
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
	/** Parses an input under a panic boundary (see {@linkcode Runner}). */
	readonly run: Runner<I, O, E>;
	/** What the schema is, as data (see {@linkcode SchemaNode}). */
	readonly node: SchemaNode;
	/** The schema's annotations, in order; a later one for a key wins. */
	readonly annotations: readonly Annotation[];
}

/**
 * What `new Schema(…)` takes: the parser (user code, see
 * {@linkcode Parser}) or the runner (see {@linkcode Runner}), and
 * optionally the schema's node and annotations. A schema that names no node
 * is `Opaque`, and one that names no annotations has none. Under
 * `exactOptionalPropertyTypes`, an omitted field is left out, not set to
 * `undefined`.
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
export type SchemaInit<I, O, E> = ParserInit<I, O, E> | RunnerInit<I, O, E>;

/**
 * A {@linkcode SchemaInit} from user code: a {@linkcode Parser}, run under
 * the parse's panic boundary.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import type { ParserInit } from "@sekhmet/schema/core/mini";
 *
 * const init: ParserInit<string, number, never> = {
 * 	parse: (input) => Ok(input.length),
 * };
 * ```
 */
export interface ParserInit<I, O, E> extends SchemaInitBase {
	/** Parses an input. */
	readonly parse: Parser<I, O, E>;
	/** Absent: a parser init has no runner. */
	readonly run?: never;
}

/**
 * A {@linkcode SchemaInit} from a {@linkcode Runner}: how composites (and
 * schemas reusing another's params) build a schema.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import { getStructParams } from "@sekhmet/primordials/struct";
 * import { type RunnerInit, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({ parse: (input: string) => Ok(input) });
 * const init: RunnerInit<string, string, never> = {
 * 	run: getStructParams(text).run,
 * };
 * ```
 */
export interface RunnerInit<I, O, E> extends SchemaInitBase {
	/** Parses an input under a panic boundary. */
	readonly run: Runner<I, O, E>;
	/** Absent: a runner init has no parser. */
	readonly parse?: never;
}

/**
 * What every {@linkcode SchemaInit} may name besides how it parses: the
 * schema's node and annotations.
 *
 * @example
 * ```ts
 * import type { SchemaInitBase } from "@sekhmet/schema/core/mini";
 *
 * const base: SchemaInitBase = { annotations: [] };
 * ```
 */
export interface SchemaInitBase {
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
 * Parses input with a schema, under a panic runtime: a `Vow` of the parse's
 * `Outcome`.
 *
 * The outcome is `Ok(output)`, `Err(error)` for an expected failure, or
 * `Panicked` with what user code (a parser, refinement, transform or async
 * schema) threw or rejected with: `options.panics` catches and reports it,
 * so a bug never passes for a validation failure. The vow resolves inside
 * the call when every step of the parse is synchronous; read it with
 * `value` from `@sekhmet/vow`, or `wait` for a `Promise`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param self The schema to use for parsing
 * @param options The input, and the panic runtime to run user code under
 * @returns A vow of the parse's outcome, resolved now when the parse was
 *   synchronous
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Result, Ok as ResultOk } from "@sekhmet/enum/result/mini";
 * import { unwrap as unwrapSome } from "@sekhmet/enum/option/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { isPanicked, unwrap } from "@sekhmet/panic/outcome/mini";
 * import { parse, Schema } from "@sekhmet/schema/core/mini";
 * import { isPending, value, wait } from "@sekhmet/vow";
 *
 * const panics = definePanicRuntime();
 * const now = new Schema({ parse: (input: string) => ResultOk(input) });
 * const later = new Schema({
 * 	parse: (input: string) => Promise.resolve(ResultOk(input)),
 * });
 *
 * // Synchronous: the vow is already resolved, read now with value
 * assertEquals(unwrap(unwrapSome(value(parse(now, { input: "a", panics })))), "a");
 *
 * const pending = parse(later, { input: "b", panics });
 * assertEquals(isPending(pending), true);
 * assertEquals(unwrap(await wait(pending)), "b");
 *
 * // A bug in user code: reported to the hook, and settled as Panicked
 * panics.setHook(() => {});
 * const buggy = new Schema({
 * 	parse: (_input: string): Result<string, never> => {
 * 		throw new Error("bug");
 * 	},
 * });
 * assertEquals(isPanicked(await wait(parse(buggy, { input: "c", panics }))), true);
 * ```
 */
export function parse<I, O, E>(
	self: Schema<I, O, E>,
	options: ParseOptions<I>,
): Vow<Outcome<O, E, unknown>> {
	const { run } = getStructParams(self);

	return step({ panics: options.panics, work: () => run(options) });
}

/** {@linkcode parseSync}'s boundary, and how to abandon what it leaves. */
interface Unwinding {
	/** The boundary the parse runs under. */
	readonly panics: PanicBoundary;
	/** Marks the parse abandoned: `parseSync` has returned or thrown. */
	readonly abandon: () => void;
}

/**
 * {@linkcode parseSync}'s boundary, one per call. While `parseSync` runs, it
 * catches nothing, so a throw in user code unwinds to its caller, as an
 * unguarded call's would. Once `parseSync` has returned, what is left of an
 * asynchronous parse runs with nobody to unwind to: a throw or rejection
 * then settles the abandoned parse as `Panicked`, which nothing reads, so
 * it never escapes as an unhandled rejection.
 */
function unwinding(): Unwinding {
	let abandoned = false;

	return {
		panics: {
			// The guard rest is type-only, as in definePanicRuntime: never read
			catchUnwind: <T>(
				fn: () => T,
				..._useCatchUnwindAsyncForPromises: unknown[]
			): Outcome<T, never, unknown> => {
				if (!abandoned) return OutcomeOk(fn());

				try {
					return OutcomeOk(fn());
				} catch (payload: unknown) {
					return Panicked(payload);
				}
			},
			// Only an abandoned parse awaits: a rejection settles it as Panicked
			catchUnwindAsync: async <T>(
				fn: () => PromiseLike<T>,
			): Promise<Outcome<T, never, unknown>> => {
				try {
					return OutcomeOk(await fn());
				} catch (payload: unknown) {
					return Panicked(payload);
				}
			},
		},
		abandon: () => {
			abandoned = true;
		},
	};
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
 * It takes no panic runtime: a throw in user code is not caught, and
 * unwinds to the caller, as any unguarded call's would. A schema that turns
 * out to be asynchronous is not waited for: its parse is abandoned, and a
 * panic it raises later settles the abandoned parse, unreported, rather
 * than escape as an unhandled rejection. Use {@linkcode parse} for either.
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
	type Synchronous = Result<O, ParseSyncError<E>>;
	const { panics, abandon } = unwinding();
	let parsing: Vow<Outcome<O, E, unknown>>;
	try {
		parsing = parse(self, { input, panics });
	} finally {
		abandon();
	}

	return match(parsing)<Synchronous>({
		Pending: () => Err(UnexpectedAsyncParse()),
		Resolved: (outcome) => {
			return match(outcome)<Synchronous>({
				Ok: (output) => Ok(output),
				Err: (error) => Err(ParseError(error)),
				Panicked: (payload) => {
					throw payload;
				},
			});
		},
	});
}

/**
 * Maps a schema's output through a transformation function.
 *
 * This creates a new schema that first parses with the original schema,
 * then applies the mapping function to successful results. A `mapping`
 * that throws panics: {@linkcode parse} settles as `Panicked`.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The error type
 * @template P The mapped output type
 * @template S The schema, exactly (with its own view)
 * @param self The schema to map
 * @param mapping The transformation function
 * @returns A new schema with transformed output, viewing `self` (`.inner`)
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
export function map<I, O, E, P, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	mapping: (output: O) => P,
): Schema<I, P, E> & TransformView<S> {
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
 * by the original schema using the provided mapping function. A `mapping`
 * that throws panics: {@linkcode parse} settles as `Panicked`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The original error type
 * @template F The mapped error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema to map
 * @param mapping The error transformation function
 * @returns A new schema with transformed errors, viewing `self` (`.inner`)
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
export function mapErr<I, O, E, F, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	mapping: (error: E) => F,
): Schema<I, O, F> & TransformView<S> {
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
 * @template S The first schema, exactly (with its own view)
 * @template N The second schema, exactly (with its own view)
 * @param self The first schema
 * @param nextSchema The second schema to apply to successful results
 * @returns A new schema representing the pipeline, viewing both schemas
 *   (`.inner`, `.next`)
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
export function pipe<
	I,
	O,
	E,
	P,
	S extends Schema<I, O, E>,
	N extends Schema<O, P, E>,
>(
	self: S & Schema<I, O, E>,
	nextSchema: N & Schema<O, P, E>,
): Schema<I, P, E> & PipeView<S, N> {
	return viewed({
		init: {
			run: (options: ParseOptions<I>) => {
				return proceed(parse(self, options), {
					panics: options.panics,
					Ok: (output) => {
						return parse(nextSchema, { input: output, panics: options.panics });
					},
					Err: (error) => settled<P, E>(Err(error)),
				});
			},
			node: new SchemaNode("Pipe", { inner: self, next: nextSchema }),
		},
		view: { inner: self, next: nextSchema },
	});
}

/**
 * How {@linkcode filter} checks an output: the type guard it must pass, and
 * how to build the error from an output that fails it. The error is the
 * filter's own: it adds to the schema's, as `andThen`'s does.
 *
 * @template O The output type
 * @template F The error type the filter fails with
 * @template P The filtered output type (a subtype of O)
 *
 * @example
 * ```ts
 * import type { FilterOptions } from "@sekhmet/schema/core/mini";
 * import { Custom, type SchemaIssue } from "@sekhmet/schema/core/mini/issue";
 *
 * const positive: FilterOptions<number, SchemaIssue, number> = {
 * 	error: (n) => Custom({ input: n, message: "not positive" }),
 * 	predicate: (n): n is number => n > 0,
 * };
 * ```
 */
export interface FilterOptions<O, F, P extends O> {
	/**
	 * Builds the error a parse fails with from the output that failed
	 * `predicate`. It is not called when the output passes.
	 */
	readonly error: (output: O) => F;
	/** The type guard each output must pass. */
	readonly predicate: (output: O) => output is P;
}

/**
 * Filters a schema's output using a type guard predicate.
 *
 * This creates a new schema that only succeeds if the original schema succeeds
 * AND the predicate returns true. A failed filter fails with the error
 * `options.error` builds from the rejected output, which adds to the
 * schema's own error type (`E | F`), as `andThen`'s does.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The error type
 * @template P The filtered output type (must be a subtype of O)
 * @template F The error type the filter fails with
 * @template S The schema, exactly (with its own view)
 * @param self The schema to filter
 * @param options The type guard predicate, and the error builder when it fails
 * @returns A new schema with filtered output, failing with either error,
 *   viewing `self` (`.inner`)
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
 * 	error: (n) => `${n} is not positive`,
 * 	predicate: (n): n is number => n > 0,
 * });
 *
 * assertEquals(union(unwrapErr(parseSync(positive, -1))), "-1 is not positive");
 * ```
 */
export function filter<I, O, E, P extends O, F, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	options: FilterOptions<O, F, P>,
): Schema<I, P, E | F> & TransformView<S> {
	const { error, predicate } = options;

	return continueWith({
		step: "filter",
		schema: self,
		next: (result) => {
			return match(result)<Result<P, E | F>>({
				Ok: (output) => {
					return predicate(output) ? Ok(output) : Err(error(output));
				},
				Err: (failure) => Err(failure),
			});
		},
	});
}

/**
 * How {@linkcode continueWith} extends a schema: which transform it is, the
 * schema to parse with, and the step each of its results goes through.
 */
interface Continuation<I, O, E, P, F, S extends Schema<I, O, E>> {
	readonly step: TransformStep;
	readonly schema: S & Schema<I, O, E>;
	readonly next: (result: Result<O, E>) => MaybePromise<Result<P, F>>;
}

/**
 * A schema that parses with `schema`, then passes the result to `next`,
 * recorded as a `Transform` node of `step` and viewing `schema` as `inner`.
 * The parse stays sync when both are; a promise from either makes it async.
 * `next` is user code, so it runs under the parse's panic boundary.
 */
function continueWith<I, O, E, P, F, S extends Schema<I, O, E>>(
	continuation: Continuation<I, O, E, P, F, S>,
): Schema<I, P, F> & TransformView<S> {
	const { step, schema, next } = continuation;

	return viewed({
		init: {
			run: (options: ParseOptions<I>) => {
				const { panics } = options;

				return proceed(parse(schema, options), {
					panics,
					Ok: (output) => guard({ panics, work: () => next(Ok(output)) }),
					Err: (error) => guard({ panics, work: () => next(Err(error)) }),
				});
			},
			node: new SchemaNode("Transform", { step, inner: schema }),
		},
		view: { inner: schema },
	});
}

/**
 * Chains a fallible transform onto a schema's output, like Result's
 * `andThen`: convert or validate in code.
 *
 * On success, the output goes to `next`, whose `Result` becomes the parse's;
 * a failure passes through without calling it. `next` may return enum's main
 * or mini `Result`, or a promise of one, which makes the parse asynchronous
 * (and `parseSync` then reports `UnexpectedAsyncParse`). A `next` that
 * throws, or whose promise rejects, panics: {@linkcode parse} settles as
 * `Panicked`, as with {@linkcode map}.
 *
 * @template I The input type
 * @template O The original output type
 * @template E The original error type
 * @template P The new output type
 * @template F The error type `next` may add
 * @template S The schema, exactly (with its own view)
 * @param self The schema whose output to transform
 * @param next The fallible transform for each successful output: a
 * {@linkcode Parser} from the output
 * @returns A new schema whose output is `next`'s, failing with either error,
 *   viewing `self` (`.inner`)
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
export function andThen<I, O, E, P, F, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	next: Parser<O, P, F>,
): Schema<I, P, E | F> & TransformView<S> {
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
 * main or mini `Result`, or a promise of one, which makes the parse
 * asynchronous (and `parseSync` then reports `UnexpectedAsyncParse`). A
 * `recover` that throws, or whose promise rejects, panics:
 * {@linkcode parse} settles as `Panicked`, as with {@linkcode mapErr}.
 *
 * @template I The input type
 * @template O The output type
 * @template E The original error type
 * @template F The error type after recovery
 * @template S The schema, exactly (with its own view)
 * @param self The schema whose failures to recover from
 * @param recover The fallback for each error: a {@linkcode Parser} from
 * the error
 * @returns A new schema that fails only with `recover`'s error, viewing
 *   `self` (`.inner`)
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
export function orElse<I, O, E, F, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	recover: Parser<E, O, F>,
): Schema<I, O, F> & TransformView<S> {
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
 * (when an asynchronous parse resolves), and never on failure. An
 * `inspector` that throws panics: {@linkcode parse} settles as `Panicked`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema whose outputs to tap
 * @param inspector The side effect for each successful output
 * @returns A new schema with the same results as `self`, viewing it
 *   (`.inner`)
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
export function inspect<I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	inspector: (output: O) => void,
): Schema<I, O, E> & TransformView<S> {
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
 * asynchronous parse resolves), and never on success. An `inspector` that
 * throws panics: {@linkcode parse} settles as `Panicked`.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema whose errors to tap
 * @param inspector The side effect for each error
 * @returns A new schema with the same results as `self`, viewing it
 *   (`.inner`)
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
export function inspectErr<I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	inspector: (error: E) => void,
): Schema<I, O, E> & TransformView<S> {
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
 * `prepare` makes the parse asynchronous (and `parseSync` then reports
 * `UnexpectedAsyncParse`). A `prepare` that throws, or whose promise
 * rejects, panics: {@linkcode parse} settles as `Panicked`, as with
 * {@linkcode map}.
 *
 * @template J The new input type
 * @template I The input type `self` parses
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema to parse the prepared input with
 * @param prepare The transform from the new input to `self`'s input
 * @returns A new schema that accepts `prepare`'s input, viewing `self`
 *   (`.inner`)
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
export function preprocess<J, I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
	prepare: (input: J) => MaybePromise<I>,
): Schema<J, O, E> & TransformView<S> {
	return viewed({
		init: {
			run: ({ input, panics }: ParseOptions<J>) => {
				const prepared = guard<I, never>({
					panics,
					work: () => {
						const returned = prepare(input);
						if (!isPromiseLike(returned)) return Ok(returned);

						return Promise.resolve(returned).then((value) => Ok(value));
					},
				});

				return proceed(prepared, {
					panics,
					Ok: (value) => parse(self, { input: value, panics }),
					Err: (impossible) => impossible,
				});
			},
			node: new SchemaNode("Transform", { step: "preprocess", inner: self }),
		},
		view: { inner: self },
	});
}
