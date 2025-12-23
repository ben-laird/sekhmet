import { Enum, type Split } from "@/src/core/mini/core.ts";

export function Some<T>(value: T): Option<T> {
	return new Option("Some", value);
}

export function None<T = never>(): Option<T> {
	return new Option("None");
}

type Variants<T> = Split<{ Some: [value: T]; None: [] }>;
export type { Variants as OptionVariants };

export class Option<out T> extends Enum<Variants<T>> {}
