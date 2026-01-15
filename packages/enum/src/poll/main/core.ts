import { match } from "@sekhmet/enum/core/mini/exit";
import * as mini from "../mini/mod.ts";

/**
 * Constructs a Poll containing a value (the Ready variant).
 *
 * @param value - The value to wrap in the Poll
 * @returns A Poll in the Ready state containing the provided value
 *
 * @example
 * ```ts ignore
 * const poll = Ready(42); // Poll<number>
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
 * ```ts ignore
 * const poll = Pending<number>(); // Poll<number>
 * ```
 */
export function Pending<T = never>(): Poll<T> {
	return new Poll("Pending");
}

/**
 * Wraps a mini version of a Poll with the "kitchen sink" version of a Poll
 * @param miniPoll - The mini Poll to wrap
 * @returns A wrapped Poll with a convenient method-based interface
 */
export function fromMini<T>(miniPoll: mini.Poll<T>): Poll<T> {
	return match(miniPoll)({
		Pending,
		Ready,
	});
}

/**
 * Full-featured Poll class providing a method-based API for poll operations.
 *
 * This is the "kitchen sink" version of the Poll class that wraps the functional
 * mini exports with a convenient method-based interface. Each method delegates to
 * its corresponding mini function while maintaining type safety.
 *
 * Poll represents a value that may not be ready yet, useful for modeling asynchronous
 * computations or lazy evaluation. It has two variants:
 * - `Ready`: Contains a value of type T
 * - `Pending`: Represents that a value is not yet available
 *
 * @template T The type of the value that may become ready
 *
 * @see {@link mini.Ready} for constructing Ready polls
 * @see {@link mini.Pending} for constructing Pending polls
 * @see {@link mini.map} for the functional map API
 *
 * @example
 * ```ts ignore
 * import { Poll, Ready, Pending } from "@sekhmet/enum/poll";
 *
 * const ready = new Poll("Ready", 42);
 * const doubled = ready.map((x) => x * 2); // Ready(84)
 *
 * const pending = new Poll<number>("Pending");
 * const result = pending.map((x) => x * 2); // Pending<number>
 * ```
 */
export class Poll<out T> extends mini.Poll<T> {
	/**
	 * Maps a Poll<T> to Poll<U> by applying a function to the Ready value.
	 *
	 * If this Poll is Ready, applies the mapping function to the contained value
	 * and returns a new Ready Poll with the result. If this Poll is Pending,
	 * returns a Pending Poll without calling the mapping function.
	 *
	 * @template U - The type of the value in the resulting Poll
	 * @param mapping - The function to apply to the Ready value
	 * @returns A new Poll with the mapped value (if Ready) or Pending (if Pending)
	 * @see {@link mini.map}
	 *
	 * @example
	 * ```ts ignore
	 * const ready = Ready(5);
	 * const doubled = ready.map((x) => x * 2); // Ready(10)
	 *
	 * const pending = Pending<number>();
	 * const result = pending.map((x) => x * 2); // Pending<number>
	 * ```
	 */
	map<U>(mapping: (value: T) => U): Poll<U> {
		return fromMini(mini.map(this, mapping));
	}

	/**
	 * Type guard to check if this Poll is in the Ready state.
	 *
	 * This method narrows the type of this Poll to indicate it contains a Ready value.
	 *
	 * @returns `true` if this Poll is Ready, `false` if Pending
	 * @see {@link mini.isReady}
	 *
	 * @example
	 * ```ts ignore
	 * const poll: Poll<number> = Ready(42);
	 *
	 * if (poll.isReady()) {
	 *   // poll is known to be Ready here
	 *   console.log("Value is ready");
	 * }
	 * ```
	 */
	isReady(): this is Poll<T> {
		return mini.isReady(this);
	}

	/**
	 * Type guard to check if this Poll is in the Pending state.
	 *
	 * This method narrows the type of this Poll to indicate it does not contain a value yet.
	 *
	 * @returns `true` if this Poll is Pending, `false` if Ready
	 * @see {@link mini.isPending}
	 *
	 * @example
	 * ```ts ignore
	 * const poll: Poll<number> = Pending();
	 *
	 * if (poll.isPending()) {
	 *   // poll is known to be Pending here
	 *   console.log("Value is not ready yet");
	 * }
	 * ```
	 */
	isPending(): this is Poll<never> {
		return mini.isPending(this);
	}
}
