import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { match } from "@/src/core/mini/exit.ts";
import { isolate } from "@/src/core/mini/isolate.ts";
import { Pending, type Poll, type PollVariants, Ready } from "./core.ts";

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
 * Narrows the Poll to its Ready variant, so its value can be read directly.
 *
 * @template T - The type of the value in the Poll
 * @param self - The Poll to check
 * @returns `true` if the Poll is Ready, `false` if Pending
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Pending, type Poll, Ready, isReady } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(isReady(Ready(42)), true);
 * assertEquals(isReady(Pending()), false);
 *
 * const poll: Poll<number> = Ready(42);
 * if (isReady(poll)) {
 *   const value: number = union(poll); // TypeScript knows poll is Ready
 *   assertEquals(value, 42);
 * }
 * ```
 */
export function isReady<T>(
	self: Poll<T>,
): self is Enum<Isolate<PollVariants<T>, "Ready">> {
	return isolate(self, "Ready");
}

/**
 * Type guard to check if a Poll is in the Pending state.
 *
 * Narrows the Poll to its Pending variant, which holds no value.
 *
 * @template T - The type of the value in the Poll
 * @param self - The Poll to check
 * @returns `true` if the Poll is Pending, `false` if Ready
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Pending, type Poll, Ready, isPending } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(isPending(Pending()), true);
 * assertEquals(isPending(Ready(42)), false);
 *
 * const poll: Poll<number> = Pending();
 * if (isPending(poll)) {
 *   // TypeScript knows poll is Pending, so no Ready arm is needed
 *   assertEquals(match(poll)({ Pending: () => "waiting" }), "waiting");
 * }
 * ```
 */
export function isPending<T>(
	self: Poll<T>,
): self is Enum<Isolate<PollVariants<T>, "Pending">> {
	return isolate(self, "Pending");
}
