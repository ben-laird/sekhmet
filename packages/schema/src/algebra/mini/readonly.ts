/**
 * Read-only outputs: {@linkcode readonly} makes a schema's output a frozen
 * shallow copy, typed by {@linkcode ReadonlyOutput}.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Child } from "@/src/composites/mini/collect.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { map, type Schema } from "@/src/core/mini/schema.ts";
import { viewed, type WrapperView } from "@/src/core/mini/view.ts";

/**
 * The type {@linkcode readonly} gives an output: a `Map` becomes a
 * `ReadonlyMap`, a `Set` a `ReadonlySet`, an array, tuple or object its
 * `Readonly` form (shallow), and anything else (primitives, functions) is
 * unchanged. It distributes over unions.
 *
 * @template T The output type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { ReadonlyOutput } from "@sekhmet/schema/algebra/mini";
 *
 * assertType<IsExact<ReadonlyOutput<string[] | number>, readonly string[] | number>>(true);
 * assertType<IsExact<ReadonlyOutput<{ a: { b: 1 } }>, { readonly a: { b: 1 } }>>(true);
 * ```
 */
export type ReadonlyOutput<T> = T extends (...args: never) => unknown
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<K, V>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<V>
			: T extends object
				? Readonly<T>
				: T;

/** Whether a value is a plain object: its prototype is `Object`'s or `null`. */
function isPlainObject(value: unknown): value is object {
	if (typeof value !== "object" || value === null) return false;
	const prototype: unknown = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
}

/**
 * A frozen shallow copy of an array or plain object, or `value` itself.
 * The copy keeps the object's prototype and every own property as defined.
 */
function frozenCopy(value: unknown): unknown {
	if (Array.isArray(value)) return Object.freeze(value.slice());
	if (!isPlainObject(value)) return value;

	return Object.freeze(
		Object.create(
			Object.getPrototypeOf(value),
			Object.getOwnPropertyDescriptors(value),
		),
	);
}

/**
 * Makes a schema's output read-only: an array or plain object output is
 * replaced by a frozen shallow copy, and its type by
 * {@linkcode ReadonlyOutput}. The copy is frozen, never the value the
 * schema produced, which may be the caller's input (`unknown()` passes it
 * through). Freezing is shallow: nested objects stay as they were.
 *
 * Other values pass through unchanged, neither copied nor frozen:
 * primitives can't change, `Object.freeze` doesn't reach the internal
 * state of a `Map`, `Set` or `Date` (a frozen `Map` still `set`s), and a
 * class instance can't be copied without bypassing its constructor. A
 * `Map` or `Set` output is still typed as a `ReadonlyMap` or `ReadonlySet`.
 *
 * The schema records a `Readonly` node over `self`, and its view
 * (`.inner`) is `self`, as passed.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @template S The schema, exactly (with its own view)
 * @param self The schema
 * @returns A schema whose array and plain object outputs are frozen copies,
 *   viewing `self`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { readonly } from "@sekhmet/schema/algebra/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const user = readonly(object({ shape: { name: string() } }));
 * const parsed = unwrap(parseSync(user, { name: "Ada" }));
 *
 * assertEquals(parsed, { name: "Ada" });
 * assertEquals(Object.isFrozen(parsed), true);
 * ```
 */
export function readonly<I, O, E, S extends Schema<I, O, E>>(
	self: S & Schema<I, O, E>,
): Schema<I, ReadonlyOutput<O>, E> & WrapperView<S>;
export function readonly(self: Child): Child & WrapperView<Child> {
	return viewed({
		init: {
			run: getStructParams(map(self, frozenCopy)).run,
			node: new SchemaNode("Readonly", { inner: self }),
		},
		view: { inner: self },
	});
}
