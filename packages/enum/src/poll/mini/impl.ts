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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, Ready, map } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(map(Ready(5), (x) => x * 2), Ready(10));
 * assertEquals(map(Pending<number>(), (x) => x * 2), Pending());
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, Ready, isReady } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(isReady(Ready(42)), true);
 * assertEquals(isReady(Pending()), false);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, Ready, isPending } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(isPending(Pending()), true);
 * assertEquals(isPending(Ready(42)), false);
 * ```
 */
export function isPending<T>(self: Poll<T>): self is Poll<never> {
	return isolate(self, "Pending");
}
