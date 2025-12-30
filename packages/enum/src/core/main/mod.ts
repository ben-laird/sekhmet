import * as mini from "../mini/mod.ts";

/**
 * Full-featured Enum class providing a method-based API for enum operations.
 *
 * This is the "kitchen sink" version of the Enum class that wraps the functional
 * mini exports with a convenient method-based interface. Each method delegates to
 * its corresponding mini function while maintaining type safety.
 *
 * The class provides three main categories of operations:
 * - Exit operations: Extract values, kinds, and pattern matching
 * - Eliminate operations: Type guards and utilities for excluding variant kinds
 * - Isolate operations: Type guards and utilities for matching variant kinds
 *
 * @template T The variant tuple type (e.g., `["success", string] | ["error", Error]`)
 *
 * @see {@link mini.union} for the functional API
 * @see {@link mini.isolate} for isolation operations
 * @see {@link mini.eliminate} for elimination operations
 */
export class Enum<out T extends mini.SomeVariant> extends mini.Enum<T> {
	/**
	 * Extracts the value from this enum variant.
	 *
	 * @returns The value portion of the variant (second element of the tuple)
	 * @see {@link mini.union}
	 */
	union(): mini.Values<T> {
		return mini.union(this);
	}

	/**
	 * Extracts the kind from this enum variant.
	 *
	 * @returns The kind portion of the variant (first element of the tuple)
	 * @see {@link mini.unionKinds}
	 */
	unionKinds(): mini.Kinds<T> {
		return mini.unionKinds(this);
	}

	/**
	 * Performs pattern matching on this enum.
	 *
	 * Executes the handler function corresponding to this enum's variant kind.
	 *
	 * @template U The return type of the match arms
	 * @param arms Record of handler functions, one for each variant kind
	 * @returns The result of executing the matched handler
	 * @see {@link mini.match}
	 */
	match<U>(arms: mini.MatchArms<T, U>): U {
		return mini.match(this)(arms);
	}

	/**
	 * Type guard to check if this enum does NOT match a specific variant kind.
	 *
	 * @param kind The variant kind to exclude
	 * @returns True if this enum is NOT of the specified kind, narrowing the type accordingly
	 * @see {@link mini.eliminate}
	 */
	eliminate<const K extends T[0]>(kind: K): this is Enum<mini.Eliminate<T, K>> {
		return mini.eliminate(this, kind);
	}

	/**
	 * Type guard to check if this enum does NOT match any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to exclude
	 * @returns True if this enum doesn't match any of the provided kinds
	 * @see {@link mini.eliminateAll}
	 */
	eliminateAll<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): this is Enum<mini.Eliminate<T, K>> {
		return mini.eliminateAll(this, kinds);
	}

	/**
	 * Asserts that this enum is NOT of a specific variant kind.
	 *
	 * @param kind The variant kind that should not match
	 * @param message Optional custom error message
	 * @throws {Error} If this enum is of the specified kind
	 * @see {@link mini.assertEliminated}
	 */
	assertEliminated<const K extends T[0]>(
		kind: K,
		message?: string,
	): asserts this is Enum<mini.Eliminate<T, K>> {
		mini.assertEliminated(this, kind, message);
	}

	/**
	 * Asserts that this enum doesn't match any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds that should not match
	 * @param message Optional custom error message
	 * @throws {Error} If this enum matches any of the specified kinds
	 * @see {@link mini.assertAllEliminated}
	 */
	assertAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		message?: string,
	): asserts this is Enum<mini.Eliminate<T, K>> {
		mini.assertAllEliminated(this, kinds, message);
	}

	/**
	 * Executes an inspector function if this enum does NOT match the specified variant kind.
	 *
	 * @param kind The variant kind to exclude
	 * @param inspector Function to execute with the variant's value if the kind doesn't match
	 * @see {@link mini.inspectEliminated}
	 */
	inspectEliminated<const K extends T[0]>(
		kind: K,
		inspector: (value: mini.Values<mini.Eliminate<T, K>>) => void,
	): void {
		mini.inspectEliminated(this, kind, inspector);
	}

	/**
	 * Executes an inspector function if this enum doesn't match any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to exclude
	 * @param inspector Function to execute with the variant if none of the kinds match
	 * @see {@link mini.inspectAllEliminated}
	 */
	inspectAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		inspector: (value: mini.Eliminate<T, K>) => void,
	): void {
		mini.inspectAllEliminated(this, kinds, inspector);
	}

	/**
	 * Generator that yields this enum's value if it does NOT match the specified variant kind.
	 *
	 * @param kind The variant kind to exclude
	 * @yields The variant's value if the kind doesn't match
	 * @see {@link mini.iterEliminated}
	 */
	iterEliminated<const K extends T[0]>(
		kind: K,
	): Generator<mini.Values<mini.Eliminate<T, K>>, void> {
		return mini.iterEliminated(this, kind);
	}

	/**
	 * Generator that yields this enum if it doesn't match any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to exclude
	 * @yields This enum if none of the kinds match
	 * @see {@link mini.iterAllEliminated}
	 */
	*iterAllEliminated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): Generator<mini.Enum<mini.Eliminate<T, K>>, void> {
		yield* mini.iterAllEliminated(this, kinds);
	}

	/**
	 * Type guard to check if this enum matches a specific variant kind.
	 *
	 * @param kind The variant kind to test for
	 * @returns True if this enum is of the specified kind, narrowing the type accordingly
	 * @see {@link mini.isolate}
	 */
	isolate<const K extends T[0]>(kind: K): this is Enum<mini.Isolate<T, K>> {
		return mini.isolate(this, kind);
	}

	/**
	 * Type guard that checks if this enum matches a specific variant kind AND satisfies a predicate.
	 *
	 * @param kind The variant kind to test for
	 * @param predicate Additional condition the variant's value must satisfy
	 * @returns True if both the kind matches and the predicate returns true
	 * @see {@link mini.isolateAnd}
	 */
	isolateAnd<const K extends T[0], U extends mini.Values<mini.Isolate<T, K>>>(
		kind: K,
		predicate:
			| ((value: mini.Values<mini.Isolate<T, K>>) => value is U)
			| ((value: mini.Values<mini.Isolate<T, K>>) => boolean),
	): this is Enum<mini.Isolate<T, K>> {
		return mini.isolateAnd(this, kind, predicate);
	}

	/**
	 * Type guard to check if this enum matches any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to test against
	 * @returns True if this enum matches any of the provided kinds
	 * @see {@link mini.isolateAny}
	 */
	isolateAny<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): this is Enum<mini.Isolate<T, K>> {
		return mini.isolateAny(this, kinds);
	}

	/**
	 * Asserts that this enum is of a specific variant kind.
	 *
	 * @param kind The expected variant kind
	 * @param message Optional custom error message
	 * @throws {Error} If this enum is not of the specified kind
	 * @see {@link mini.assertIsolated}
	 */
	assertIsolated<const K extends T[0]>(
		kind: K,
		message?: string,
	): asserts this is Enum<mini.Isolate<T, K>> {
		mini.assertIsolated(this, kind, message);
	}

	/**
	 * Asserts that this enum matches any of the specified variant kinds.
	 *
	 * @param kinds Set of acceptable variant kinds
	 * @param message Optional custom error message
	 * @throws {Error} If this enum doesn't match any of the specified kinds
	 * @see {@link mini.assertAnyIsolated}
	 */
	assertAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		message?: string,
	): asserts this is Enum<mini.Isolate<T, K>> {
		mini.assertAnyIsolated(this, kinds, message);
	}

	/**
	 * Executes an inspector function if this enum matches the specified variant kind.
	 *
	 * @param kind The variant kind to match
	 * @param inspector Function to execute with the variant's value if the kind matches
	 * @see {@link mini.inspectIsolated}
	 */
	inspectIsolated<const K extends T[0]>(
		kind: K,
		inspector: (value: mini.Values<mini.Isolate<T, K>>) => void,
	): void {
		mini.inspectIsolated(this, kind, inspector);
	}

	/**
	 * Executes an inspector function if this enum matches any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to match against
	 * @param inspector Function to execute with the variant if any kind matches
	 * @see {@link mini.inspectAnyIsolated}
	 */
	inspectAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
		inspector: (value: mini.Isolate<T, K>) => void,
	): void {
		mini.inspectAnyIsolated(this, kinds, inspector);
	}

	/**
	 * Generator that yields this enum's value if it matches the specified variant kind.
	 *
	 * @param kind The variant kind to match
	 * @yields The variant's value if the kind matches
	 * @see {@link mini.iterIsolated}
	 */
	iterIsolated<const K extends T[0]>(
		kind: K,
	): Generator<mini.Values<mini.Isolate<T, K>>, void> {
		return mini.iterIsolated(this, kind);
	}

	/**
	 * Generator that yields this enum if it matches any of the specified variant kinds.
	 *
	 * @param kinds Set of variant kinds to match against
	 * @yields This enum if any kind matches
	 * @see {@link mini.iterAnyIsolated}
	 */
	*iterAnyIsolated<const K extends T[0]>(
		kinds: ReadonlySet<K>,
	): Generator<mini.Enum<mini.Isolate<T, K>>, void> {
		yield* mini.iterAnyIsolated(this, kinds);
	}
}
