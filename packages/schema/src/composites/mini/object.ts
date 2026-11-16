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
	/** Each field's schema. */
	readonly shape: S;
	/**
	 * What to do with undeclared keys (see {@linkcode UnknownKeys}).
	 *
	 * @default "strip"
	 */
	readonly unknownKeys?: U;
}

/** The issues for each undeclared key of a strict object. */
function unknownKeyIssues(
	input: Readonly<Record<PropertyKey, unknown>>,
	keys: readonly string[],
): Issues<SchemaIssue> | undefined {
	const [first, ...rest] = keys.map((key) => ({
		path: [key],
		error: UnknownKey({ key, input: input[key] }),
	}));

	return first === undefined ? undefined : issues([first, ...rest]);
}

/**
 * Creates a schema for objects with the given fields. Every field is
 * parsed, and every failing field is reported at its path. A missing key is
 * parsed as `undefined`, so only fields that accept `undefined` (see
 * `optional`) may be missing; they become optional properties.
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
 * const text = new Schema((input: unknown) =>
 * 	typeof input === "string" ? Ok(input) : Err("not text"),
 * );
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
	readonly shape: Readonly<Record<string, Child>>;
	readonly unknownKeys?: UnknownKeys;
}): Schema<unknown, unknown, Issues<unknown>> {
	const { shape } = options;
	const unknownKeys = options.unknownKeys ?? "strip";
	const fields = Object.entries(shape);

	return new Schema((input: unknown): Parsed => {
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
	});
}
