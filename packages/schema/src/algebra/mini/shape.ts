/**
 * Reshapers: plain functions from one {@linkcode Shape} to another, for
 * building an `object` schema's shape from an existing one. They work on
 * shapes, not schemas, so the shape stays a plain value; extend a shape with
 * a spread, `{ ...shape, extra: string() }`. Declare a standalone shape
 * `satisfies Shape`, not `: Shape`, so its keys and each `key: "optional"`
 * stay literal.
 *
 * @module
 */

import type {
	Field,
	FieldSchema,
	Shape,
} from "@/src/composites/mini/object.ts";
import { type AnySchema, Schema } from "@/src/core/mini/schema.ts";

/**
 * What {@linkcode pick} keeps of a shape.
 *
 * @template S The shape
 * @template K The keys to keep
 *
 * @example
 * ```ts
 * import { pick, type PickOptions } from "@sekhmet/schema/algebra/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const shape = { name: string(), email: string() };
 * const options: PickOptions<typeof shape, "name"> = { shape, keys: ["name"] };
 * const named = pick(options);
 * ```
 */
export interface PickOptions<S extends Shape, K extends keyof S & string> {
	/** The shape to pick from. */
	readonly shape: S;
	/** The keys to keep. */
	readonly keys: readonly K[];
}

/**
 * What {@linkcode omit} drops from a shape.
 *
 * @template S The shape
 * @template K The keys to drop
 *
 * @example
 * ```ts
 * import { omit, type OmitOptions } from "@sekhmet/schema/algebra/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const shape = { name: string(), password: string() };
 * const options: OmitOptions<typeof shape, "password"> = { shape, keys: ["password"] };
 * const visible = omit(options);
 * ```
 */
export interface OmitOptions<S extends Shape, K extends keyof S & string> {
	/** The shape to drop keys from. */
	readonly shape: S;
	/** The keys to drop. */
	readonly keys: readonly K[];
}

/**
 * `S` with every key optional: each value becomes a field entry with
 * `key: "optional"`, keeping its schema (and so its value-optionality).
 *
 * @template S The shape
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { PartialShape } from "@sekhmet/schema/algebra/mini";
 * import type { Field } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Text = Schema<unknown, string, Error>;
 * assertType<IsExact<PartialShape<{ name: Text }>, { name: Field<Text, "optional"> }>>(true);
 * ```
 */
export type PartialShape<S extends Shape> = {
	[K in keyof S]: Field<FieldSchema<S[K]>, "optional">;
};

/**
 * `S` with every key required: each field entry becomes its bare schema,
 * so a `key: "optional"` is dropped while an `.optional()` value stays.
 *
 * @template S The shape
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { RequiredShape } from "@sekhmet/schema/algebra/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Text = Schema<unknown, string, Error>;
 * assertType<IsExact<RequiredShape<{ name: { schema: Text; key: "optional" } }>, { name: Text }>>(true);
 * ```
 */
export type RequiredShape<S extends Shape> = {
	[K in keyof S]: FieldSchema<S[K]>;
};

/** A shape value's schema: the schema itself, or a field entry's. */
function schemaOf(entry: AnySchema | Field): AnySchema {
	if (entry instanceof Schema) return entry;

	return entry.schema;
}

/**
 * A shape with only the given keys of `shape`. A key it doesn't declare is
 * a type error.
 *
 * @template S The shape
 * @template K The keys to keep
 * @param options The shape, and the keys to keep
 * @returns The shape's entries for `keys`, as declared
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { pick } from "@sekhmet/schema/algebra/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const user = { name: string(), age: number() };
 * const name = object({ shape: pick({ shape: user, keys: ["name"] }) });
 *
 * assertEquals(unwrap(parseSync(name, { name: "Ada", age: 36 })), { name: "Ada" });
 * ```
 */
export function pick<S extends Shape, const K extends keyof S & string>(
	options: PickOptions<S, K>,
): Pick<S, K>;
export function pick(options: {
	readonly shape: Shape;
	readonly keys: readonly string[];
}): Shape {
	const { shape, keys } = options;

	return Object.fromEntries(
		Object.entries(shape).filter(([key]) => {
			return keys.includes(key);
		}),
	);
}

/**
 * A shape with every key of `shape` but the given ones. A key it doesn't
 * declare is a type error.
 *
 * @template S The shape
 * @template K The keys to drop
 * @param options The shape, and the keys to drop
 * @returns The shape's other entries, as declared
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { omit } from "@sekhmet/schema/algebra/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const account = { name: string(), password: string() };
 * const visible = object({ shape: omit({ shape: account, keys: ["password"] }) });
 *
 * assertEquals(unwrap(parseSync(visible, { name: "Ada", password: "x" })), { name: "Ada" });
 * ```
 */
export function omit<S extends Shape, const K extends keyof S & string>(
	options: OmitOptions<S, K>,
): Omit<S, K>;
export function omit(options: {
	readonly shape: Shape;
	readonly keys: readonly string[];
}): Shape {
	const { shape, keys } = options;

	return Object.fromEntries(
		Object.entries(shape).filter(([key]) => {
			return !keys.includes(key);
		}),
	);
}

/**
 * A shape with every key of `shape` optional: each value becomes
 * `{ schema, key: "optional" }`. A present key's value must still parse;
 * a value-optional schema (`.optional()`) still also accepts `undefined`.
 *
 * @template S The shape
 * @param shape The shape
 * @returns The shape, every key optional
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { partial } from "@sekhmet/schema/algebra/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const patch = object({ shape: partial({ name: string(), email: string() }) });
 *
 * assertEquals(unwrap(parseSync(patch, { name: "Ada" })), { name: "Ada" });
 * assertEquals(isErr(parseSync(patch, { name: undefined })), true);
 * ```
 */
export function partial<S extends Shape>(shape: S): PartialShape<S>;
export function partial(shape: Shape): Shape {
	return Object.fromEntries(
		Object.entries(shape).map(([key, entry]) => {
			return [key, { schema: schemaOf(entry), key: "optional" }];
		}),
	);
}

/**
 * A shape with every key of `shape` required: each field entry becomes its
 * bare schema. Only key-optionality is dropped: a value-optional schema
 * (`.optional()`) still accepts `undefined`, under a key that must now be
 * present.
 *
 * @template S The shape
 * @param shape The shape
 * @returns The shape, every key required
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { required } from "@sekhmet/schema/algebra/mini";
 * import { object, type Shape } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const draft = { title: { schema: string(), key: "optional" } } satisfies Shape;
 * const post = object({ shape: required(draft) });
 *
 * assertEquals(unwrap(parseSync(post, { title: "Hi" })), { title: "Hi" });
 * assertEquals(isErr(parseSync(post, {})), true);
 * ```
 */
export function required<S extends Shape>(shape: S): RequiredShape<S>;
export function required(shape: Shape): Shape {
	return Object.fromEntries(
		Object.entries(shape).map(([key, entry]) => {
			return [key, schemaOf(entry)];
		}),
	);
}
