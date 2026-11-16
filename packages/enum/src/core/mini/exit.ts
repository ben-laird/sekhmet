/**
 * Leaving an enum: read its kind ({@linkcode unionKinds}) or value
 * ({@linkcode union}), or handle every variant with {@linkcode match}.
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import type { Enum, Isolate, Kinds, SomeVariant, Values } from "./core.ts";

/**
 * Extracts the value from an enum variant.
 * @param self The enum to extract the value from
 * @returns The value portion of the variant (second element of the tuple)
 */
export function union<T extends SomeVariant>(self: Enum<T>): Values<T> {
	return getStructParams(self).variant[1];
}

/**
 * Extracts the kind from an enum variant.
 * @param self The enum to extract the kind from
 * @returns The kind portion of the variant (first element of the tuple)
 */
export function unionKinds<T extends SomeVariant>(self: Enum<T>): Kinds<T> {
	return getStructParams(self).variant[0];
}

/**
 * Creates a pattern matching function for an enum.
 * Returns a function that takes match arms (handlers for each variant) and executes the appropriate handler.
 * @param self The enum to match against
 * @returns A function that accepts match arms and returns the result of the matched handler
 */
export function match<T extends SomeVariant>(
	self: Enum<T>,
): <U>(arms: MatchArms<T, U>) => U {
	return (arms) => arms[unionKinds(self)](...toTupleValueUnsafely(self));
}

/**
 * A record of handler functions for pattern matching, one for each variant kind.
 * Each handler receives the variant's value(s) as arguments and returns a value of type `U`.
 */
export type MatchArms<T extends SomeVariant, U> = {
	[K in Kinds<T>]: (...v: TupleValue<Isolate<T, K>>) => U;
};

function toTupleValueUnsafely<T extends SomeVariant>(
	e: Enum<T>,
): TupleValue<T> {
	const [_, ...v] = getStructParams(e).variant;

	return v as TupleValue<T>;
}

/**
 * Extracts the value portion from an enum variant tuple, excluding the kind.
 * For variants with values `[kind, ...values]`, returns the values as a tuple.
 * For variants without values `[kind]`, returns never.
 */
export type TupleValue<T extends SomeVariant> = T extends [string, ...infer V]
	? V
	: never;
