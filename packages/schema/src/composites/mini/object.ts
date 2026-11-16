import { getStructParams, type struct } from "@sekhmet/primordials/struct";
import { type SchemaIssue, UnknownKey } from "@/src/core/mini/issue.ts";
import {
	concat,
	type Flatten,
	fromError,
	type Issues,
	prefix,
} from "@/src/core/mini/issues.ts";
import {
	type AnySchema,
	type ErrorOf,
	type Input,
	type Output,
	type Parser,
	Schema,
} from "@/src/core/mini/schema.ts";
import {
	type Child,
	compose,
	invalidType,
	isRecord,
	type Parsed,
	run,
} from "./collect.ts";

/**
 * An object schema's fields: each key's schema.
 *
 * @example
 * ```ts
 * import type { Shape } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const user: Shape = { name: string() };
 * ```
 */
export type Shape = { readonly [key: string]: AnySchema };

/**
 * What an object schema does with keys its {@linkcode Shape} doesn't
 * declare: `"strip"` drops them from the output (the default), `"strict"`
 * reports each as an `UnknownKey` issue, and `"passthrough"` copies them.
 *
 * @example
 * ```ts
 * import type { UnknownKeys } from "@sekhmet/schema/composites/mini";
 *
 * const policy: UnknownKeys = "strict";
 * ```
 */
export type UnknownKeys = "strip" | "strict" | "passthrough";

/**
 * `T` with every property whose type includes `undefined` made optional, so
 * a field built with `optional` may be missing.
 *
 * @template T The object type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { WithOptionalKeys } from "@sekhmet/schema/composites/mini";
 *
 * type User = WithOptionalKeys<{ name: string; age: number | undefined }>;
 * assertType<IsExact<User, { name: string; age?: number | undefined }>>(true);
 * ```
 */
export type WithOptionalKeys<T> = {
	[K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
	[K in keyof T as undefined extends T[K] ? K : never]?: T[K];
} extends infer Flat
	? { [K in keyof Flat]: Flat[K] }
	: never;

/**
 * The input an object schema accepts: `unknown` when every field accepts
 * anything, and otherwise an object of the fields' inputs.
 *
 * @template S The object's shape
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ObjectInput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Loose = ObjectInput<{ name: Schema<unknown, string, Error> }>;
 * type Typed = ObjectInput<{ name: Schema<string, string, Error> }>;
 *
 * assertType<IsExact<Loose, unknown>>(true);
 * assertType<IsExact<Typed, { name: string }>>(true);
 * ```
 */
export type ObjectInput<S extends Shape> = [
	{
		[K in keyof S]-?: unknown extends Input<S[K]> ? never : K;
	}[keyof S],
] extends [never]
	? unknown
	: WithOptionalKeys<{ [K in keyof S]: Input<S[K]> }>;

/**
 * The output of an object schema: each field's output, with fields whose
 * output includes `undefined` optional. A `"passthrough"` object also keeps
 * undeclared keys.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ObjectOutput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type User = ObjectOutput<{ name: Schema<unknown, string, Error> }, "strip">;
 * assertType<IsExact<User, { name: string }>>(true);
 * ```
 */
export type ObjectOutput<
	S extends Shape,
	U extends UnknownKeys,
> = U extends "passthrough"
	? WithOptionalKeys<{ [K in keyof S]: Output<S[K]> }> & {
			[key: string]: unknown;
		}
	: WithOptionalKeys<{ [K in keyof S]: Output<S[K]> }>;

/**
 * The error of an object schema: every field's errors, flattened, plus the
 * `SchemaIssue`s the object reports itself (`InvalidType`, `UnknownKey`).
 *
 * @template S The object's shape
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ObjectError } from "@sekhmet/schema/composites/mini";
 * import type { Issues, Schema, SchemaIssue } from "@sekhmet/schema/core/mini";
 *
 * type Errors = ObjectError<{ name: Schema<unknown, string, "empty"> }>;
 * assertType<IsExact<Errors, Issues<"empty" | SchemaIssue>>>(true);
 * ```
 */
export type ObjectError<S extends Shape> = Issues<
	Flatten<ErrorOf<S[keyof S]>> | SchemaIssue
>;

/**
 * An object schema's parser, carrying the declaration it was built from so
 * `strict`, `passthrough` and `strip` can rebuild it.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { getStructParams } from "@sekhmet/primordials/struct";
 * import { object } from "@sekhmet/schema/composites/mini";
 *
 * assertEquals(getStructParams(object({})).unknownKeys, "strip");
 * ```
 */
export interface ObjectParser<S extends Shape, U extends UnknownKeys>
	extends Parser<ObjectInput<S>, ObjectOutput<S, U>, ObjectError<S>> {
	/** The fields. */
	readonly shape: S;
	/** What the object does with undeclared keys. */
	readonly unknownKeys: U;
}

/**
 * An object schema holds an {@linkcode ObjectParser}, not just a parser.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 */
export interface ObjectSchema<S extends Shape, U extends UnknownKeys> {
	/** The parser, with the object's declaration. */
	[struct]: ObjectParser<S, U>;
}

/**
 * A schema for objects with known fields. Its parser remembers the
 * {@linkcode Shape}, so `strict`, `passthrough` and `strip` can change what
 * it does with undeclared keys.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const user = object({ name: string() });
 *
 * assertEquals(unwrap(parseSync(user, { name: "Ada", admin: true })), { name: "Ada" });
 * ```
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: narrows the struct params under --isolatedDeclarations, as Struct itself does (microsoft/TypeScript#61892)
export class ObjectSchema<
	S extends Shape,
	U extends UnknownKeys,
> extends Schema<ObjectInput<S>, ObjectOutput<S, U>, ObjectError<S>> {
	/**
	 * Wraps an object parser; build one with {@linkcode object}.
	 *
	 * @param parser The parser and its declaration
	 */
	constructor(parser: ObjectParser<S, U>) {
		super(parser);
	}
}

/** The issues for each undeclared key of a strict object. */
function unknownKeyIssues(
	input: Readonly<Record<PropertyKey, unknown>>,
	keys: readonly string[],
): Issues<SchemaIssue> | undefined {
	return keys
		.map((key) =>
			prefix(fromError(UnknownKey({ key, input: input[key] })), key),
		)
		.reduce<Issues<SchemaIssue> | undefined>(
			(issues, more) => (issues === undefined ? more : concat(issues, more)),
			undefined,
		);
}

/** Builds an object parser from its declaration. */
function objectParser<S extends Shape, U extends UnknownKeys>(declaration: {
	shape: S;
	unknownKeys: U;
}): ObjectParser<S, U>;
function objectParser(declaration: {
	shape: Readonly<Record<string, Child>>;
	unknownKeys: UnknownKeys;
}): ((input: unknown) => Parsed) & {
	shape: Readonly<Record<string, Child>>;
	unknownKeys: UnknownKeys;
} {
	const { shape, unknownKeys } = declaration;
	const fields = Object.entries(shape);

	const parser = (input: unknown): Parsed => {
		if (!isRecord(input)) return invalidType({ input, expected: "object" });

		const undeclared = Object.keys(input).filter(
			(key) => !Object.hasOwn(shape, key),
		);
		const pending = fields.map(([key, child]) =>
			run({ key, child, value: input[key] }),
		);

		return compose({
			pending,
			extra:
				unknownKeys === "strict"
					? unknownKeyIssues(input, undeclared)
					: undefined,
			build: (outputs) =>
				Object.fromEntries([
					...outputs.filter(
						([key, output]) =>
							output !== undefined || Object.hasOwn(input, key),
					),
					...(unknownKeys === "passthrough"
						? undeclared.map((key) => [key, input[key]])
						: []),
				]),
		});
	};

	return Object.assign(parser, { shape, unknownKeys });
}

/**
 * Creates a schema for objects with the given fields. Every field is
 * parsed, and every failing field is reported at its path. A missing key is
 * parsed as `undefined`, so only fields that accept `undefined` (see
 * `optional`) may be missing; they become optional properties. Keys the
 * shape doesn't declare are stripped from the output; see
 * {@linkcode strict} and {@linkcode passthrough}.
 *
 * A non-object input (including `null` and arrays) fails with an
 * `InvalidType` issue at the root.
 *
 * @template S The object's shape
 * @param shape Each field's schema
 * @returns A schema for objects of that shape
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/enum/result/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { entries, parse, Schema } from "@sekhmet/schema/core/mini";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 *
 * const text = new Schema((input: unknown) =>
 * 	typeof input === "string" ? Ok(input) : Err("not text"),
 * );
 * const user = object({ name: text, address: object({ zip: text }) });
 *
 * const issues = unwrapErr(await union(parse(user, { name: 1, address: { zip: 2 } })));
 * assertEquals(
 * 	entries(issues).map(({ path }) => path),
 * 	[["name"], ["address", "zip"]],
 * );
 * ```
 */
export function object<S extends Shape>(shape: S): ObjectSchema<S, "strip"> {
	return new ObjectSchema(objectParser({ shape, unknownKeys: "strip" }));
}

/**
 * Makes an object schema report each undeclared key as an `UnknownKey`
 * issue at that key's path.
 *
 * @template S The object's shape
 * @template U What the object did with undeclared keys
 * @param self The object schema
 * @returns The same object schema, rejecting undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrapErr } from "@sekhmet/enum/result/mini";
 * import { object, strict } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync } from "@sekhmet/schema/core/mini";
 *
 * const empty = strict(object({}));
 * const [issue] = entries(unwrapErr(await parseAsync(empty, { admin: true })));
 *
 * assertEquals(issue.path, ["admin"]);
 * ```
 */
export function strict<S extends Shape, U extends UnknownKeys>(
	self: ObjectSchema<S, U>,
): ObjectSchema<S, "strict"> {
	const { shape } = getStructParams(self);

	return new ObjectSchema(objectParser({ shape, unknownKeys: "strict" }));
}

/**
 * Makes an object schema copy undeclared keys to its output unchecked.
 *
 * @template S The object's shape
 * @template U What the object did with undeclared keys
 * @param self The object schema
 * @returns The same object schema, keeping undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { object, passthrough } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 *
 * const loose = passthrough(object({}));
 *
 * assertEquals(unwrap(parseSync(loose, { admin: true })), { admin: true });
 * ```
 */
export function passthrough<S extends Shape, U extends UnknownKeys>(
	self: ObjectSchema<S, U>,
): ObjectSchema<S, "passthrough"> {
	const { shape } = getStructParams(self);

	return new ObjectSchema(objectParser({ shape, unknownKeys: "passthrough" }));
}

/**
 * Makes an object schema drop undeclared keys from its output: the default,
 * restored after {@linkcode strict} or {@linkcode passthrough}.
 *
 * @template S The object's shape
 * @template U What the object did with undeclared keys
 * @param self The object schema
 * @returns The same object schema, stripping undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { object, strict, strip } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 *
 * const lenient = strip(strict(object({})));
 *
 * assertEquals(unwrap(parseSync(lenient, { admin: true })), {});
 * ```
 */
export function strip<S extends Shape, U extends UnknownKeys>(
	self: ObjectSchema<S, U>,
): ObjectSchema<S, "strip"> {
	const { shape } = getStructParams(self);

	return new ObjectSchema(objectParser({ shape, unknownKeys: "strip" }));
}
