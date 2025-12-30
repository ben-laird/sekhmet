import { Struct } from "@sekhmet/primordials/struct";

/**
 * A variant tuple representing either a kind-only variant `[kind]` or a kind-value variant `[kind, value]`.
 * This is the fundamental building block for all enum types in Sekhmet.
 */
export type SomeVariant<K extends string = string> =
	| [kind: K]
	| [kind: K, value: unknown];

/**
 * The raw internal structure of an enum containing a variant tuple.
 */
export interface RawEnum<T extends SomeVariant> {
	/** The variant tuple stored in this enum */
	variant: T;
}

/**
 * An enum representing a collection of variants without using TypeScript unions.
 * Built on top of {@linkcode Struct} for encapsulation.
 */
export class Enum<out T extends SomeVariant> extends Struct<RawEnum<T>> {
	/**
	 * Creates a new enum from a variant tuple.
	 * @param variant The variant tuple elements (kind and optional value)
	 */
	constructor(...variant: T) {
		super({ variant });
	}
}

// Types

/**
 * Infers the variant type `T` from an `Enum<T>`.
 */
export type InferEnum<E extends Enum<SomeVariant>> =
	E extends Enum<infer T> ? T : never;

/**
 * Extracts the kind (first element) from a variant tuple type.
 */
export type Kinds<T extends SomeVariant> = T[0];

/**
 * Extracts the value (second element) from a variant tuple type.
 */
export type Values<T extends SomeVariant> = T[1];

/**
 * A record type mapping variant kinds to their value tuples (empty for valueless variants).
 * Used as input to {@linkcode Split} for constructing variant unions from object specifications.
 */
export type SomeSplitVariants<K extends string = string> = Record<
	Kinds<SomeVariant<K>>,
	[Values<SomeVariant<K>>] | []
>;

/**
 * Converts a record of variant specifications into a union of variant tuples.
 * Each key becomes a variant kind, and the corresponding value becomes the variant's value tuple.
 */
export type Split<T extends SomeSplitVariants> = {
	[K in keyof T]: [kind: K, ...v: T[K]];
}[keyof T];

// Determining a variant

/**
 * Isolates a specific variant `K` from a variant union `T`.
 * Returns only the variant tuple(s) matching kind `K`.
 */
export type Isolate<T extends SomeVariant, K extends Kinds<T>> = Extract<
	T,
	SomeVariant<K>
>;

/**
 * Eliminates a specific variant `K` from a variant union `T`.
 * Returns all variant tuples except those matching kind `K`.
 */
export type Eliminate<T extends SomeVariant, K extends Kinds<T>> = Exclude<
	T,
	SomeVariant<K>
>;
