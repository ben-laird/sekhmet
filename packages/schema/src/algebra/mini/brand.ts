import { getStructParams } from "@sekhmet/primordials/struct";
import type { Child, ChildParsed } from "@/src/composites/mini/collect.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import { recordBrand } from "./registry.ts";

/**
 * The key of the type-only brand {@linkcode Branded} adds. No value ever
 * carries it at runtime: a brand exists only in the types, and parsing with
 * a branded schema is what proves a value has it.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { BRAND } from "@sekhmet/schema/algebra/mini";
 *
 * assertEquals(typeof BRAND, "symbol");
 * ```
 */
export const BRAND: unique symbol = Symbol("@sekhmet/schema/brand");

/**
 * `T`, branded `B`: assignable to `T`, but a plain `T` isn't assignable to
 * it, so only a value a branded schema parsed (or one already branded) has
 * the type. Brands compose: `Branded<Branded<T, "A">, "B">` is both an
 * `"A"` and a `"B"`.
 *
 * @template T The branded type
 * @template B The brand's name
 *
 * @example
 * ```ts
 * import type { Branded } from "@sekhmet/schema/algebra/mini";
 *
 * type UserId = Branded<string, "UserId">;
 *
 * const greet = (id: UserId): string => `hello ${id}`;
 * // @ts-expect-error a plain string has no brand
 * greet("ada");
 * ```
 */
export type Branded<T, B extends string> = T & {
	readonly [BRAND]: { readonly [K in B]: true };
};

/**
 * Brands a schema's output `name`: its output type becomes
 * `Branded<O, name>`, so parsing with it is the branded type's smart
 * constructor. The output passes through unchanged at runtime; the brand is
 * type-only. The name is a value, not a type argument, so the schema's own
 * type parameters are still inferred.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template B The brand's name
 * @param self The schema to brand
 * @param name The brand's name
 * @returns A schema whose output is branded `name`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { brand, type Branded } from "@sekhmet/schema/algebra/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * type UserId = Branded<string, "UserId">;
 * const userId = brand(string({ format: "uuid" }), "UserId");
 *
 * const id: UserId = unwrap(parseSync(userId, "4f3c1f9e-8f0a-4b8e-9a59-0a1b2c3d4e5f"));
 * assertEquals(id, "4f3c1f9e-8f0a-4b8e-9a59-0a1b2c3d4e5f");
 * ```
 */
export function brand<I, O, E, const B extends string>(
	self: Schema<I, O, E>,
	name: B,
): Schema<I, Branded<O, B>, E>;
export function brand(self: Child, name: string): Child {
	const parser = getStructParams(self);
	const branded = (input: unknown): ChildParsed => {
		return parser(input);
	};
	recordBrand({ parser: branded, name, inner: self });

	return new Schema(branded);
}
