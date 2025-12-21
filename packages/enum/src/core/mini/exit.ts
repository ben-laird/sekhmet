import { getStructParams } from "@sekhmet/primordials/struct";
import type { Enum, Isolate, Kinds, SomeVariant, Values } from "./core.ts";

export function union<T extends SomeVariant>(self: Enum<T>): Values<T> {
	return getStructParams(self).variant[1];
}

export function unionKinds<T extends SomeVariant>(self: Enum<T>): Kinds<T> {
	return getStructParams(self).variant[0];
}

export function match<T extends SomeVariant>(
	self: Enum<T>,
): <U>(arms: MatchArms<T, U>) => U {
	return (arms) => arms[unionKinds(self)](...toTupleValueUnsafely(self));
}

export type MatchArms<T extends SomeVariant, U> = {
	[K in Kinds<T>]: (...v: TupleValue<Isolate<T, K>>) => U;
};

function toTupleValueUnsafely<T extends SomeVariant>(
	e: Enum<T>,
): TupleValue<T> {
	const [_, ...v] = getStructParams(e).variant;

	return v as TupleValue<T>;
}

type TupleValue<T extends SomeVariant> = T extends [string, ...infer V]
	? V
	: never;
// {}
