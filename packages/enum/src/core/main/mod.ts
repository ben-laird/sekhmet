import * as mini from "../mini/mod.ts";

export class Enum<out T extends mini.SomeVariant> extends mini.Enum<T> {
	union(): mini.Values<T> {
		return mini.union(this);
	}

	unionKinds(): mini.Kinds<T> {
		return mini.unionKinds(this);
	}

	match<U>(arms: mini.MatchArms<T, U>): U {
		return mini.match(this)(arms);
	}

	eliminate<const K extends T[0]>(kind: K): this is Enum<mini.Eliminate<T, K>> {
		return mini.eliminate(this, kind);
	}

	eliminateAll<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): this is Enum<mini.Eliminate<T, K>> {
		return mini.eliminateAll(this, kinds);
	}

	assertEliminated<const K extends T[0]>(
		kind: K,
		message?: string,
	): asserts this is Enum<mini.Eliminate<T, K>> {
		mini.assertEliminated(this, kind, message);
	}

	assertAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		message?: string,
	): asserts this is Enum<mini.Eliminate<T, K>> {
		mini.assertAllEliminated(this, kinds, message);
	}

	inspectEliminated<const K extends T[0]>(
		kind: K,
		inspector: (value: mini.Values<mini.Eliminate<T, K>>) => void,
	): void {
		mini.inspectEliminated(this, kind, inspector);
	}

	inspectAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		inspector: (value: mini.Eliminate<T, K>) => void,
	): void {
		mini.inspectAllEliminated(this, kinds, inspector);
	}

	iterEliminated<const K extends T[0]>(
		kind: K,
	): Generator<mini.Values<mini.Eliminate<T, K>>, void> {
		return mini.iterEliminated(this, kind);
	}

	*iterAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): Generator<mini.Enum<mini.Eliminate<T, K>>, void> {
		yield* mini.iterAllEliminated(this, kinds);
	}

	isolate<const K extends T[0]>(kind: K): this is Enum<mini.Isolate<T, K>> {
		return mini.isolate(this, kind);
	}

	isolateAnd<const K extends T[0], U extends mini.Values<mini.Isolate<T, K>>>(
		kind: K,
		predicate:
			| ((value: mini.Values<mini.Isolate<T, K>>) => value is U)
			| ((value: mini.Values<mini.Isolate<T, K>>) => boolean),
	): this is Enum<mini.Isolate<T, K>> {
		return mini.isolateAnd(this, kind, predicate);
	}

	isolateAny<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): this is Enum<mini.Isolate<T, K>> {
		return mini.isolateAny(this, kinds);
	}

	assertIsolated<const K extends T[0]>(
		kind: K,
		message?: string,
	): asserts this is Enum<mini.Isolate<T, K>> {
		mini.assertIsolated(this, kind, message);
	}

	assertAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		message?: string,
	): asserts this is Enum<mini.Isolate<T, K>> {
		mini.assertAnyIsolated(this, kinds, message);
	}

	inspectIsolated<const K extends T[0]>(
		kind: K,
		inspector: (value: mini.Values<mini.Isolate<T, K>>) => void,
	): void {
		mini.inspectIsolated(this, kind, inspector);
	}

	inspectAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		inspector: (value: mini.Isolate<T, K>) => void,
	): void {
		mini.inspectAnyIsolated(this, kinds, inspector);
	}

	iterIsolated<const K extends T[0]>(
		kind: K,
	): Generator<mini.Values<mini.Isolate<T, K>>, void> {
		return mini.iterIsolated(this, kind);
	}

	*iterAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): Generator<mini.Enum<mini.Isolate<T, K>>, void> {
		yield* mini.iterAnyIsolated(this, kinds);
	}
}
