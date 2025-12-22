import { Struct } from "@sekhmet/primordials/struct";

export type SomeVariant<K extends string = string> =
	| [kind: K]
	| [kind: K, value: unknown];
// {}

export interface RawEnum<T extends SomeVariant> {
	variant: T;
}

export class Enum<out T extends SomeVariant> extends Struct<RawEnum<T>> {
	constructor(...variant: T) {
		super({ variant });
	}
}

// Types

export type InferEnum<E extends Enum<SomeVariant>> =
	E extends Enum<infer T> ? T : never;
// {}

export type Kinds<T extends SomeVariant> = T[0];

export type Values<T extends SomeVariant> = T[1];

export type SomeSplitVariants<K extends string = string> = Record<
	Kinds<SomeVariant<K>>,
	[Values<SomeVariant<K>>] | []
>;

export type Split<T extends SomeSplitVariants> = {
	[K in keyof T]: [kind: K, ...v: T[K]];
}[keyof T];

// Determining a variant

export type Isolate<T extends SomeVariant, K extends Kinds<T>> = Extract<
	T,
	SomeVariant<K>
>;

export type Eliminate<T extends SomeVariant, K extends Kinds<T>> = Exclude<
	T,
	SomeVariant<K>
>;
