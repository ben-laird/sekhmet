import { match } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { Pending, type Poll, Ready } from "./core.ts";

/**
 * Maps a Poll<T> to Poll<U> by applying a function to the Ready value.
 *
 * If the Poll is Ready, applies the mapping function to the contained value
 * and returns a new Ready Poll with the result. If the Poll is Pending,
 * returns a Pending Poll without calling the mapping function.
 *
 * @template T - The type of the value in the source Poll
 * @template U - The type of the value in the resulting Poll
 * @param self - The Poll to map over
 * @param mapping - The function to apply to the Ready value
 * @returns A new Poll with the mapped value (if Ready) or Pending (if Pending)
 *
 * @example
 * ```ts ignore
 * const ready = Ready(5);
 * const doubled = map(ready, (x) => x * 2); // Ready(10)
 *
 * const pending = Pending<number>();
 * const result = map(pending, (x) => x * 2); // Pending<number>
 * ```
 */
export function map<T, U>(self: Poll<T>, mapping: (value: T) => U): Poll<U> {
	return match(self)({ Pending, Ready: (value) => Ready(mapping(value)) });
}

/**
 * Type guard to check if a Poll is in the Ready state.
 *
 * This function narrows the type of the Poll to indicate it contains a Ready value.
 *
 * @template T - The type of the value in the Poll
 * @param self - The Poll to check
 * @returns `true` if the Poll is Ready, `false` if Pending
 *
 * @example
 * ```ts ignore
 * const poll: Poll<number> = Ready(42);
 *
 * if (isReady(poll)) {
 *   // poll is known to be Ready here
 *   console.log("Value is ready");
 * }
 * ```
 */
export function isReady<T>(self: Poll<T>): self is Poll<T> {
	return isolate(self, "Ready");
}

/**
 * Type guard to check if a Poll is in the Pending state.
 *
 * This function narrows the type of the Poll to indicate it does not contain a value yet.
 *
 * @template T - The type of the value in the Poll
 * @param self - The Poll to check
 * @returns `true` if the Poll is Pending, `false` if Ready
 *
 * @example
 * ```ts ignore
 * const poll: Poll<number> = Pending();
 *
 * if (isPending(poll)) {
 *   // poll is known to be Pending here
 *   console.log("Value is not ready yet");
 * }
 * ```
 */
export function isPending<T>(self: Poll<T>): self is Poll<never> {
	return isolate(self, "Pending");
}
