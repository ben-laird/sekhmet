import { getStructParams } from "@sekhmet/primordials/struct";
import type { Enum, Isolate, SomeVariant, Values } from "./core.ts";
import { union, unionKinds } from "./exit.ts";

export function isolate<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): self is Enum<Isolate<T, K>> {
	return unionKinds(self) === kind;
}

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
): self is Enum<Isolate<T, K>> {
	return isolate(self, kind) && predicate(union(self));
}

export function isolateAny<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): self is Enum<Isolate<T, K>> {
	for (const kind of kinds) {
		if (isolate(self, kind)) return true;
	}

	return false;
}

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

export function inspectIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
	inspector: (value: Values<Isolate<T, K>>) => void,
): void {
	if (isolate(self, kind)) {
		inspector(union(self));
	}
}

export function inspectAnyIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
	inspector: (value: Isolate<T, K>) => void,
): void {
	if (isolateAny(self, kinds)) {
		inspector(getStructParams(self).variant);
	}
}

export function* iterIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kind: K,
): Generator<Values<Isolate<T, K>>, void> {
	if (isolate(self, kind)) {
		yield union(self);
	}
}

export function* iterAnyIsolated<T extends SomeVariant, const K extends T[0]>(
	self: Enum<T>,
	kinds: ReadonlySet<K>,
): Generator<Enum<Isolate<T, K>>, void> {
	if (isolateAny(self, kinds)) {
		yield self;
	}
}
