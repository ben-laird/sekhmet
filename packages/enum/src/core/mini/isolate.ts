/**
 * Narrowing an enum to one variant (or several): type guards, assertions,
 * inspectors and iterators that act only when the enum is of the given kind.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Enum, Isolate, Refine, SomeVariant, Values } from "./core.ts";
import { union, unionKinds } from "./exit.ts";

/**
 * Type guard to check if an enum matches a specific variant kind.
 * @param self The enum to check
 * @param kind The variant kind to test for
 * @returns True if the enum is of the specified kind, narrowing the type accordingly
 */
export function isolate<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): self is Enum<Isolate<T, K>> {
	return unionKinds(self) === kind;
}

/**
 * Type guard that checks if an enum matches a specific variant kind AND satisfies a predicate on its value.
 *
 * Narrows the enum to the variant `K`. When the predicate is itself a type
 * guard for `U`, the variant's value narrows to `U` as well.
 *
 * @param self The enum to check
 * @param kind The variant kind to test for
 * @param predicate Additional condition the variant's value must satisfy
 * @returns True if both the kind matches and the predicate returns true
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Enum, isolateAnd, type Split, union } from "@sekhmet/enum/core/mini";
 *
 * class Reading extends Enum<Split<{ Value: [value: string | number]; Missing: [] }>> {}
 *
 * const reading = new Reading("Value", 42);
 * if (isolateAnd(reading, "Value", (v): v is number => typeof v === "number")) {
 *   const value: number = union(reading); // the Value variant, holding a number
 *   assertEquals(value, 42);
 * }
 * ```
 */
export function isolateAnd<
	T extends SomeVariant,
	const K extends T[0],
	U extends Values<Isolate<T, K>>,
>(
	self: Enum<T>,
	kind: K,
	predicate:
		| ((value: Values<Isolate<T, K>>) => value is U)
		| ((value: Values<Isolate<T, K>>) => boolean),
): self is Enum<Refine<Isolate<T, K>, U>> {
	return isolate(self, kind) && predicate(union(self));
}

/**
 * Type guard to check if an enum matches any of the specified variant kinds.
 * @param self The enum to check
 * @param kinds Set of variant kinds to test against
 * @returns True if the enum matches any of the provided kinds
 */
export function isolateAny<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): self is Enum<Isolate<T, K>> {
	for (const kind of kinds) {
		if (isolate(self, kind)) return true;
	}

	return false;
}

/**
 * Asserts that an enum is of a specific variant kind, throwing an error if not.
 * @param self The enum to assert
 * @param kind The expected variant kind
 * @param message Optional custom error message
 * @throws {Error} If the enum is not of the specified kind
 */
export function assertIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	message?: string,
): asserts self is Enum<Isolate<T, K>> {
	if (isolate(self, kind)) return;

	const panicMessage = (() => {
		if (message) return message;

		return `Enum should be ${kind}, but it was ${unionKinds(self)}`;
	})();

	throw new Error(panicMessage, { cause: self });
}

/**
 * Asserts that an enum matches any of the specified variant kinds, throwing an error if not.
 * @param self The enum to assert
 * @param kinds Set of acceptable variant kinds
 * @param message Optional custom error message
 * @throws {Error} If the enum doesn't match any of the specified kinds
 */
export function assertAnyIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
	message?: string,
): asserts self is Enum<Isolate<T, K>> {
	if (isolateAny(self, kinds)) return;

	const panicMessage = (() => {
		if (message) return message;

		const expectedKinds = kinds.values().reduce((acc, kind, idx) => {
			if (idx === 0) return kind;

			return `${acc}, or ${kind}`;
		}, "");

		return `Enum should be any one of ${expectedKinds}, but it was ${unionKinds(self)}`;
	})();

	throw new Error(panicMessage, { cause: self });
}

/**
 * Executes an inspector function if the enum matches the specified variant kind.
 * @param self The enum to inspect
 * @param kind The variant kind to match
 * @param inspector Function to execute with the variant's value if the kind matches
 */
export function inspectIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	inspector: (value: Values<Isolate<T, K>>) => void,
): void {
	if (isolate(self, kind)) {
		inspector(union(self));
	}
}

/**
 * Executes an inspector function if the enum matches any of the specified variant kinds.
 * @param self The enum to inspect
 * @param kinds Set of variant kinds to match against
 * @param inspector Function to execute with the variant if any kind matches
 */
export function inspectAnyIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
	inspector: (value: Isolate<T, K>) => void,
): void {
	if (isolateAny(self, kinds)) {
		inspector(getStructParams(self).variant);
	}
}

/**
 * Generator that yields the enum's value if it matches the specified variant kind.
 * @param self The enum to check
 * @param kind The variant kind to match
 * @yields The variant's value if the kind matches
 */
export function* iterIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): Generator<Values<Isolate<T, K>>, void> {
	if (isolate(self, kind)) {
		yield union(self);
	}
}

/**
 * Generator that yields the enum if it matches any of the specified variant kinds.
 * @param self The enum to check
 * @param kinds Set of variant kinds to match against
 * @yields The enum if any kind matches
 */
export function* iterAnyIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): Generator<Enum<Isolate<T, K>>, void> {
	if (isolateAny(self, kinds)) {
		yield self;
	}
}
