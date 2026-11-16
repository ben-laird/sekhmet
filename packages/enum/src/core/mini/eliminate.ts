/**
 * Narrowing an enum by ruling variants out: the complement of the `isolate`
 * functions, as type guards, assertions, inspectors and iterators.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Eliminate, Enum, SomeVariant, Values } from "./core.ts";
import { union, unionKinds } from "./exit.ts";

/**
 * Type guard to check if an enum does NOT match a specific variant kind.
 * @param self The enum to check
 * @param kind The variant kind to exclude
 * @returns True if the enum is NOT of the specified kind, narrowing the type accordingly
 */
export function eliminate<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): self is Enum<Eliminate<T, K>> {
	return unionKinds(self) !== kind;
}

/**
 * Type guard to check if an enum does NOT match any of the specified variant kinds.
 * @param self The enum to check
 * @param kinds Set of variant kinds to exclude
 * @returns True if the enum doesn't match any of the provided kinds
 */
export function eliminateAll<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): self is Enum<Eliminate<T, K>> {
	for (const kind of kinds) {
		if (!eliminate(self, kind)) return false;
	}

	return true;
}

/**
 * Asserts that an enum is NOT of a specific variant kind, throwing an error if it is.
 * @param self The enum to assert
 * @param kind The variant kind that should not match
 * @param message Optional custom error message
 * @throws {Error} If the enum is of the specified kind
 */
export function assertEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	message?: string,
): asserts self is Enum<Eliminate<T, K>> {
	if (eliminate(self, kind)) return;

	const panicMessage = message ?? `Enum should not be ${kind}`;

	throw new Error(panicMessage, { cause: self });
}

/**
 * Asserts that an enum doesn't match any of the specified variant kinds, throwing an error if it does.
 * @param self The enum to assert
 * @param kinds Set of variant kinds that should not match
 * @param message Optional custom error message
 * @throws {Error} If the enum matches any of the specified kinds
 */
export function assertAllEliminated<
	T extends SomeVariant,
	const K extends T[0],
>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
	message?: string,
): asserts self is Enum<Eliminate<T, K>> {
	if (eliminateAll(self, kinds)) return;

	const panicMessage = (() => {
		if (message) return message;

		const expectedKinds = kinds.values().reduce((acc, kind, idx) => {
			if (idx === 0) return kind;

			return `${acc}, or ${kind}`;
		}, "");

		return `Enum should not be any one of ${expectedKinds}, but it was ${unionKinds(self)}`;
	})();

	throw new Error(panicMessage, { cause: self });
}

/**
 * Executes an inspector function if the enum does NOT match the specified variant kind.
 * @param self The enum to inspect
 * @param kind The variant kind to exclude
 * @param inspector Function to execute with the variant's value if the kind doesn't match
 */
export function inspectEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	inspector: (value: Values<Eliminate<T, K>>) => void,
): void {
	if (eliminate(self, kind)) {
		inspector(union(self));
	}
}

/**
 * Executes an inspector function if the enum doesn't match any of the specified variant kinds.
 * @param self The enum to inspect
 * @param kinds Set of variant kinds to exclude
 * @param inspector Function to execute with the variant if none of the kinds match
 */
export function inspectAllEliminated<
	T extends SomeVariant,
	const K extends T[0],
>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
	inspector: (value: Eliminate<T, K>) => void,
): void {
	if (eliminateAll(self, kinds)) {
		inspector(getStructParams(self).variant);
	}
}

/**
 * Generator that yields the enum's value if it does NOT match the specified variant kind.
 * @param self The enum to check
 * @param kind The variant kind to exclude
 * @yields The variant's value if the kind doesn't match
 */
export function* iterEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): Generator<Values<Eliminate<T, K>>, void> {
	if (eliminate(self, kind)) {
		yield union(self);
	}
}

/**
 * Generator that yields the enum if it doesn't match any of the specified variant kinds.
 * @param self The enum to check
 * @param kinds Set of variant kinds to exclude
 * @yields The enum if none of the kinds match
 */
export function* iterAllEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): Generator<Enum<Eliminate<T, K>>, void> {
	if (eliminateAll(self, kinds)) {
		yield self;
	}
}
