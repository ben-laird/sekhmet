import { getStructParams } from "@sekhmet/primordials/struct";
import type { Eliminate, Enum, SomeVariant, Values } from "./core.ts";
import { union, unionKinds } from "./exit.ts";

export function eliminate<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): self is Enum<Eliminate<T, K>> {
	return unionKinds(self) !== kind;
}

export function eliminateAll<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): self is Enum<Eliminate<T, K>> {
	for (const kind of kinds) {
		if (!eliminate(self, kind)) return false;
	}

	return true;
}

export function assertEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	message?: string,
): asserts self is Enum<Eliminate<T, K>> {
	if (eliminate(self, kind)) return;

	const panicMessage = message ?? `Enum should not be ${kind}`;

	throw new Error(panicMessage, { cause: self });
}

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

export function inspectEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	inspector: (value: Values<Eliminate<T, K>>) => void,
): void {
	if (eliminate(self, kind)) {
		inspector(union(self));
	}
}

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

export function* iterEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): Generator<Values<Eliminate<T, K>>, void> {
	if (eliminate(self, kind)) {
		yield union(self);
	}
}

export function* iterAllEliminated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): Generator<Enum<Eliminate<T, K>>, void> {
	if (eliminateAll(self, kinds)) {
		yield self;
	}
}
