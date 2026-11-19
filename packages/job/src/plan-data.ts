/**
 * Walking a plan's data: needs may sit anywhere in plain arrays and plain
 * objects, at any depth. Anything else passes through untouched.
 *
 * @module
 */

import { type AnyNeed, Need } from "@/src/need.ts";

/**
 * Whether `value` is a plain object: its prototype is `Object.prototype`
 * or `null`.
 *
 * @param value Any value
 * @returns `true` for a plain object
 */
export function isPlainRecord(
	value: unknown,
): value is { readonly [key: PropertyKey]: unknown } {
	if (typeof value !== "object" || value === null) return false;

	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Every need in `value`, depth first, in declaration order.
 *
 * @param value A plan, or part of one
 * @returns The needs found
 */
export function collectNeeds(value: unknown): readonly AnyNeed[] {
	if (value instanceof Need) return [value];
	if (Array.isArray(value)) return value.flatMap(collectNeeds);
	if (isPlainRecord(value)) return ownValues(value).flatMap(collectNeeds);
	return [];
}

/**
 * A copy of `value` with each need replaced by what `resolve` gives for it.
 * Plain arrays and objects are copied (symbol keys included); anything else
 * is kept as is.
 *
 * @param options.value A plan, or part of one
 * @param options.resolve What a need becomes
 * @returns The resolved copy
 */
export function resolveNeeds({
	value,
	resolve,
}: {
	readonly value: unknown;
	readonly resolve: (need: AnyNeed) => unknown;
}): unknown {
	if (value instanceof Need) return resolve(value);
	if (Array.isArray(value)) {
		return value.map((item: unknown) => resolveNeeds({ value: item, resolve }));
	}
	if (!isPlainRecord(value)) return value;

	const resolved: { [key: PropertyKey]: unknown } = {};
	for (const key of ownKeys(value)) {
		resolved[key] = resolveNeeds({ value: value[key], resolve });
	}
	return resolved;
}

/** A plain object's own enumerable keys, symbols included. */
function ownKeys(record: object): readonly PropertyKey[] {
	return Reflect.ownKeys(record).filter((key) => {
		return Object.prototype.propertyIsEnumerable.call(record, key);
	});
}

function ownValues(record: {
	readonly [key: PropertyKey]: unknown;
}): readonly unknown[] {
	return ownKeys(record).map((key) => record[key]);
}
