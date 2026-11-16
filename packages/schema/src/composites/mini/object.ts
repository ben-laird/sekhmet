import { type SchemaIssue, UnknownKey } from "@/src/core/mini/issue.ts";
import { type Flatten, type Issues, issues } from "@/src/core/mini/issues.ts";
import {
	type AnySchema,
	type ErrorOf,
	type Input,
	type Output,
	Schema,
} from "@/src/core/mini/schema.ts";
import {
	type Child,
	compose,
	invalidType,
	isRecord,
	type Parsed,
	type Pending,
	run,
	withoutOptional,
} from "./collect.ts";

/**
 * Whether an object's key must be present (`"required"`) or may be missing
 * (`"optional"`). A present key's value is always parsed.
 *
 * @example
 * ```ts
 * import type { KeyPresence } from "@sekhmet/schema/composites/mini";
 *
 * const presence: KeyPresence = "optional";
 * ```
 */
export type KeyPresence = "required" | "optional";

/**
 * A field entry of a {@linkcode Shape}: the field's schema, and whether its
 * key may be missing. A bare schema in a shape is a required key, the same
 * as `{ schema, key: "required" }`.
 *
 * @template S The field's schema
 * @template K Whether the key may be missing
 *
 * @example
 * ```ts
 * import type { Field } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const nickname: Field = { schema: string(), key: "optional" };
 * ```
 */
export interface Field<
	S extends AnySchema = AnySchema,
	K extends KeyPresence = KeyPresence,
> {
	/** The schema the key's value is parsed with, when the key is present. */
	readonly schema: S;
	/** Whether the key may be missing. */
	readonly key: K;
}

/**
 * An object schema's fields: each key's schema (a required key), or a
 * {@linkcode Field} entry declaring whether the key may be missing.
 *
 * @example
 * ```ts
 * import type { Shape } from "@sekhmet/schema/composites/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const user: Shape = {
 * 	name: string(),
 * 	nickname: { schema: string(), key: "optional" },
 * };
 * ```
 */
export type Shape = { readonly [key: string]: AnySchema | Field };

/**
 * The schema of a shape's value: the schema itself, or a field entry's.
 *
 * @template V A shape's value
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { FieldSchema } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Text = Schema<unknown, string, Error>;
 * assertType<IsExact<FieldSchema<Text>, Text>>(true);
 * assertType<IsExact<FieldSchema<{ schema: Text; key: "optional" }>, Text>>(true);
 * ```
 */
export type FieldSchema<V> = V extends {
	readonly schema: infer S extends AnySchema;
}
	? S
	: V extends AnySchema
		? V
		: never;

/**
 * `T`, one property per key of the shape `S`, with the keys `S` declares
 * `key: "optional"` made optional. Under `exactOptionalPropertyTypes` an
 * optional key's type gains no `undefined`: a present key must parse.
 *
 * @template S The object's shape
 * @template T Each key's type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { WithOptionalKeys } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Text = Schema<unknown, string, Error>;
 * type User = WithOptionalKeys<
 * 	{ name: Text; nickname: { schema: Text; key: "optional" } },
 * 	{ name: string; nickname: string }
 * >;
 * assertType<IsExact<User, { name: string; nickname?: string }>>(true);
 * ```
 */
export type WithOptionalKeys<
	S extends Shape,
	T extends { readonly [K in keyof S]: unknown },
> = {
	[K in keyof S as S[K] extends { readonly key: "optional" } ? never : K]: T[K];
} & {
	[K in keyof S as S[K] extends { readonly key: "optional" }
		? K
		: never]?: T[K];
} extends infer Flat
	? { [K in keyof Flat]: Flat[K] }
	: never;

/**
 * The input an object schema accepts: `unknown` when every field accepts
 * anything, and otherwise an object of the fields' inputs, with the keys the
 * shape declares optional optional.
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
		[K in keyof S]-?: unknown extends Input<FieldSchema<S[K]>> ? never : K;
	}[keyof S],
] extends [never]
	? unknown
	: WithOptionalKeys<S, { [K in keyof S]: Input<FieldSchema<S[K]>> }>;

/**
 * The output of an object schema: each field's output, with the keys the
 * shape declares optional optional. A `"passthrough"` object also keeps
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
	? WithOptionalKeys<S, { [K in keyof S]: Output<FieldSchema<S[K]>> }> & {
			[key: string]: unknown;
		}
	: WithOptionalKeys<S, { [K in keyof S]: Output<FieldSchema<S[K]>> }>;

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
	Flatten<ErrorOf<FieldSchema<S[keyof S]>>> | SchemaIssue
>;

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
 * What {@linkcode object} builds a schema from: the fields, and what to do
 * with keys they don't declare.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { object, type ObjectOptions } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const options = { shape: { name: string() }, unknownKeys: "passthrough" } satisfies ObjectOptions<
 * 	{ name: ReturnType<typeof string> },
 * 	"passthrough"
 * >;
 *
 * assertEquals(unwrap(parseSync(object(options), { name: "Ada", admin: true })), {
 * 	name: "Ada",
 * 	admin: true,
 * });
 * ```
 */
export interface ObjectOptions<S extends Shape, U extends UnknownKeys> {
	/** Each field's schema, or its field entry. */
	readonly shape: S;
	/**
	 * What to do with undeclared keys (see {@linkcode UnknownKeys}).
	 *
	 * @default "strip"
	 */
	readonly unknownKeys?: U;
}

/** The issues for each undeclared key of a strict object. */
function unknownKeyIssues({
	input,
	keys,
}: {
	input: Readonly<Record<PropertyKey, unknown>>;
	keys: readonly string[];
}): Issues<SchemaIssue> | undefined {
	const [first, ...rest] = keys.map((key) => ({
		path: [key],
		error: UnknownKey({ key, input: input[key] }),
	}));

	return first === undefined ? undefined : issues([first, ...rest]);
}

/** An erased shape value: a child schema, or its field entry. */
type Entry = Child | { readonly schema: Child; readonly key: KeyPresence };

/** How an object parses one key. */
interface Plan {
	/** The key. */
	readonly key: string;
	/** What a present key's value is parsed with. */
	readonly schema: Child;
	/**
	 * What a missing key is parsed with (as `undefined`): the schema without
	 * its `optional` modifiers, so a value-optional field still needs its key;
	 * `undefined` when the key may be missing.
	 */
	readonly missing: Child | undefined;
}

/** How an object parses a key, from its shape entry. */
function planOf([key, entry]: [string, Entry]): Plan {
	if (entry instanceof Schema) {
		return { key, schema: entry, missing: withoutOptional(entry) };
	}

	if (entry.key === "optional") {
		return { key, schema: entry.schema, missing: undefined };
	}

	return { key, schema: entry.schema, missing: withoutOptional(entry.schema) };
}

/**
 * Creates a schema for objects with the given fields. Every field is
 * parsed, and every failing field is reported at its path.
 *
 * A shape's value is a schema, whose key is required, or a field entry
 * `{ schema, key }`. `key: "optional"` lets the key be missing (it is then
 * left out of the output); a present key's value must still parse, so
 * `{ nickname: undefined }` fails unless the schema accepts `undefined`.
 * `.optional()` (`optional`) only makes the value optional: the key stays
 * required. A missing required key fails with the issue its schema, without
 * `optional`, reports for `undefined`, at the key's path.
 *
 * - `a: string()` gives `{ a: string }`;
 * - `a: optional(string())` gives `{ a: string | undefined }`;
 * - `a: { schema: string(), key: "optional" }` gives `{ a?: string }`;
 * - `a: { schema: optional(string()), key: "optional" }` gives
 *   `{ a?: string | undefined }`.
 *
 * Keys the shape doesn't declare are stripped from the output by default;
 * `unknownKeys: "strict"` reports each as an `UnknownKey` issue at its path,
 * and `unknownKeys: "passthrough"` copies them to the output unchecked.
 *
 * A non-object input (including `null` and arrays) fails with an
 * `InvalidType` issue at the root.
 *
 * @template S The object's shape
 * @template U What the object does with undeclared keys
 * @param options The fields, and what to do with undeclared keys
 * @returns A schema for objects of that shape
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { entries, parseAsync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "string" ? Ok(input) : Err("not text");
 * 	},
 * });
 * const user = object({
 * 	shape: { name: text, address: object({ shape: { zip: text } }) },
 * });
 *
 * const found = unwrapErr(await parseAsync(user, { name: 1, address: { zip: 2 } }));
 * assertEquals(
 * 	entries(found).map(({ path }) => path),
 * 	[["name"], ["address", "zip"]],
 * );
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { object, optional } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const user = object({
 * 	shape: {
 * 		name: string(),
 * 		middle: optional(string()),
 * 		nickname: { schema: string(), key: "optional" },
 * 	},
 * });
 *
 * assertEquals(unwrap(parseSync(user, { name: "Ada", middle: undefined })), {
 * 	name: "Ada",
 * 	middle: undefined,
 * });
 * assertEquals(isErr(parseSync(user, { name: "Ada" })), true);
 * assertEquals(isErr(parseSync(user, { name: "Ada", middle: "A", nickname: undefined })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { entries, parseAsync, parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const shape = { name: string() };
 * const strict = object({ shape, unknownKeys: "strict" });
 * const loose = object({ shape, unknownKeys: "passthrough" });
 * const input = { name: "Ada", admin: true };
 *
 * assertEquals(unwrap(parseSync(object({ shape }), input)), { name: "Ada" });
 * assertEquals(unwrap(parseSync(loose, input)), input);
 * const [issue] = entries(unwrapErr(await parseAsync(strict, input)));
 * assertEquals(issue.path, ["admin"]);
 * ```
 */
export function object<S extends Shape, U extends UnknownKeys = "strip">(
	options: ObjectOptions<S, U>,
): Schema<ObjectInput<S>, ObjectOutput<S, U>, ObjectError<S>>;
export function object(options: {
	readonly shape: Readonly<Record<string, Entry>>;
	readonly unknownKeys?: UnknownKeys;
}): Schema<unknown, unknown, Issues<unknown>> {
	const { shape } = options;
	const unknownKeys = options.unknownKeys ?? "strip";
	const plans = Object.entries(shape).map(planOf);

	return new Schema({
		parse: (input: unknown): Parsed => {
			if (!isRecord(input)) return invalidType({ input, expected: "object" });

			const undeclared = Object.keys(input).filter(
				(key) => !Object.hasOwn(shape, key),
			);
			const pending = plans.flatMap(({ key, schema, missing }): Pending[] => {
				if (Object.hasOwn(input, key)) {
					return [run({ key, child: schema, value: input[key] })];
				}

				if (missing === undefined) return [];

				return [run({ key, child: missing, value: undefined })];
			});

			const reported = unknownKeys === "strict" ? undeclared : [];
			const kept = unknownKeys === "passthrough" ? undeclared : [];

			return compose({
				pending,
				extra: unknownKeyIssues({ input, keys: reported }),
				build: (outputs) => {
					return Object.fromEntries([
						...outputs,
						...kept.map((key) => [key, input[key]]),
					]);
				},
			});
		},
	});
}
