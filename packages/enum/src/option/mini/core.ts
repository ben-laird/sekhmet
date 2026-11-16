/**
 * The `Option` class and its `Some` and `None` constructors.
 *
 * @module
 */

import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Constructs an Option containing a value (the Some variant).
 *
 * @param value - The value to wrap in the Option
 * @returns An Option in the Some state containing the provided value
 *
 * @example
 * ```ts
 * import { type Option, Some } from "@sekhmet/enum/option/mini";
 *
 * const opt: Option<number> = Some(42);
 * ```
 */
export function Some<T>(value: T): Option<T> {
	return new Option("Some", value);
}

/**
 * Constructs an empty Option (the None variant).
 *
 * @returns An Option in the None state, representing the absence of a value
 *
 * @example
 * ```ts
 * import { None, type Option } from "@sekhmet/enum/option/mini";
 *
 * const opt: Option<number> = None<number>();
 * ```
 */
export function None<T = never>(): Option<T> {
	return new Option("None");
}

/**
 * The variant types for an Option.
 *
 * Represents the two possible states:
 * - `Some`: Contains a value of type T
 * - `None`: Contains no value
 */
type Variants<T> = Split<{ Some: [value: T]; None: [] }>;
export type { Variants as OptionVariants };

/**
 * A type-safe optional value that can be either Some (containing a value) or None (empty).
 *
 * Option is a Rust-inspired Maybe/Optional type built on the Enum framework.
 * It represents the presence or absence of a value in a type-safe way, eliminating
 * the need for null or undefined checks.
 *
 * @template T - The type of the value that may be present
 *
 * @example
 * ```ts
 * import { None, type Option, Some } from "@sekhmet/enum/option/mini";
 *
 * const some: Option<number> = Some(42);
 * const none: Option<number> = None();
 * ```
 */
export class Option<out T> extends Enum<Variants<T>> {}
