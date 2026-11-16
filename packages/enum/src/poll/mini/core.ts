import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Constructs a Poll containing a value (the Ready variant).
 *
 * @param value - The value to wrap in the Poll
 * @returns A Poll in the Ready state containing the provided value
 *
 * @example
 * ```ts
 * import { type Poll, Ready } from "@sekhmet/enum/poll/mini";
 *
 * const poll: Poll<number> = Ready(42);
 * ```
 */
export function Ready<T>(value: T): Poll<T> {
	return new Poll("Ready", value);
}

/**
 * Constructs a Poll in the Pending state (the Pending variant).
 *
 * @returns A Poll in the Pending state, representing that a value is not yet ready
 *
 * @example
 * ```ts
 * import { Pending, type Poll } from "@sekhmet/enum/poll/mini";
 *
 * const poll: Poll<number> = Pending<number>();
 * ```
 */
export function Pending<T = never>(): Poll<T> {
	return new Poll("Pending");
}

/**
 * The variant types for a Poll.
 *
 * Represents the two possible states:
 * - `Ready`: Contains a value of type T
 * - `Pending`: Represents that a value is not yet ready
 */
type Variants<T> = Split<{ Ready: [value: T]; Pending: [] }>;
export type { Variants as PollVariants };

/**
 * A type-safe Poll value that can be either Ready (containing a value) or Pending (not yet ready).
 *
 * Poll is a Rust-inspired type built on the Enum framework.
 * It represents a value that may not be ready yet, useful for modeling asynchronous
 * computations or lazy evaluation in a type-safe way.
 *
 * @template T - The type of the value that may become ready
 *
 * @example
 * ```ts
 * import { Pending, type Poll, Ready } from "@sekhmet/enum/poll/mini";
 *
 * const ready: Poll<number> = Ready(42);
 * const pending: Poll<number> = Pending();
 * ```
 */
export class Poll<out T> extends Enum<Variants<T>> {}
