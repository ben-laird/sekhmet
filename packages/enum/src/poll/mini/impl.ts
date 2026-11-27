import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { match, union } from "@/src/core/mini/exit.ts";
import { assertIsolated, isolate } from "@/src/core/mini/isolate.ts";
import type { Result } from "@/src/result/mini/core.ts";
import {
	map as mapResult,
	mapErr as mapResultErr,
} from "@/src/result/mini/transform.ts";
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
 * Maps the success value of a ready Result: Rust's
 * `Poll<Result<T, E>>::map_ok`.
 *
 * `Ready(Ok(value))` becomes `Ready(Ok(mapping(value)))`; `Ready(Err(e))`
 * and `Pending` pass through without calling `mapping`.
 *
 * @template T - The success type of the Result in the source Poll
 * @template E - The error type of the Result
 * @template U - The success type of the Result in the resulting Poll
 * @param self - The Poll of a Result to map over
 * @param mapping - The function to apply to the success value
 * @returns A Poll of the Result with its success value mapped
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, type Poll, Ready, map, mapOk } from "@sekhmet/enum/poll/mini";
 * import { Err, Ok, type Result, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 *
 * const done: Poll<Result<number, string>> = Ready(Ok(5));
 * const failed: Poll<Result<number, string>> = Ready(Err("boom"));
 * const waiting: Poll<Result<number, string>> = Pending();
 *
 * assertEquals(map(mapOk(done, (n) => n * 2), unwrap), Ready(10));
 * assertEquals(map(mapOk(failed, (n) => n * 2), unwrapErr), Ready("boom"));
 * assertEquals(mapOk(waiting, (n) => n * 2), Pending());
 * ```
 */
export function mapOk<T, E, U>(
	self: Poll<Result<T, E>>,
	mapping: (value: T) => U,
): Poll<Result<U, E>> {
	return map(self, (result) => mapResult(result, mapping));
}

/**
 * Maps the error value of a ready Result: Rust's
 * `Poll<Result<T, E>>::map_err`.
 *
 * `Ready(Err(error))` becomes `Ready(Err(mapping(error)))`; `Ready(Ok(v))`
 * and `Pending` pass through without calling `mapping`.
 *
 * @template T - The success type of the Result
 * @template E - The error type of the Result in the source Poll
 * @template F - The error type of the Result in the resulting Poll
 * @param self - The Poll of a Result to map over
 * @param mapping - The function to apply to the error value
 * @returns A Poll of the Result with its error value mapped
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Pending, type Poll, Ready, map, mapErr } from "@sekhmet/enum/poll/mini";
 * import { Err, Ok, type Result, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 *
 * const failed: Poll<Result<number, string>> = Ready(Err("boom"));
 * const done: Poll<Result<number, string>> = Ready(Ok(5));
 * const waiting: Poll<Result<number, string>> = Pending();
 *
 * assertEquals(map(mapErr(failed, (e) => e.length), unwrapErr), Ready(4));
 * assertEquals(map(mapErr(done, (e) => e.length), unwrap), Ready(5));
 * assertEquals(mapErr(waiting, (e) => e.length), Pending());
 * ```
 */
export function mapErr<T, E, F>(
	self: Poll<Result<T, E>>,
	mapping: (error: E) => F,
): Poll<Result<T, F>> {
	return map(self, (result) => mapResultErr(result, mapping));
}

/**
 * Type guard to check if a Poll is in the Ready state.
 *
 * Narrows both the variant and the type parameter: the Poll becomes its Ready
 * variant, so its value can be read directly, and stays a `Poll<T>`.
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
 *   const value: number = union(poll); // the variant: poll is Ready
 *   const same: Poll<number> = poll; // the type parameter: still a Poll<number>
 *   assertEquals(value, 42);
 *   assertEquals(same, poll);
 * }
 * ```
 */
export function isReady<T>(
	self: Poll<T>,
): self is Enum<Isolate<PollVariants<T>, "Ready">> & Poll<T> {
	return isolate(self, "Ready");
}

/**
 * Type guard to check if a Poll is in the Pending state.
 *
 * Narrows both the variant and the type parameter: the Poll becomes its
 * Pending variant, which holds no value, and a `Poll<never>`, which fits a Poll
 * of any type.
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
 *   // the variant: poll is Pending, so no Ready arm is needed
 *   assertEquals(match(poll)({ Pending: () => "waiting" }), "waiting");
 *   // the type parameter: poll is a Poll<never>, so it fits any Poll
 *   const other: Poll<string> = poll;
 *   assertEquals(other, Pending());
 * }
 * ```
 */
export function isPending<T>(
	self: Poll<T>,
): self is Enum<Isolate<PollVariants<T>, "Pending">> & Poll<never> {
	return isolate(self, "Pending");
}

/**
 * Unwraps a Poll, yielding the Ready value or throwing an error with a custom
 * message if it is still Pending.
 *
 * Use this when the value must already be there, such as reading work that
 * settled synchronously; the message says why it should have been Ready.
 *
 * @template T - The type of the value in the Poll
 * @param self - The Poll to unwrap
 * @param message - Custom error message to use if the Poll is Pending
 * @returns The Ready value
 * @throws Error with the provided message if the Poll is Pending
 *
 * @example
 * ```ts
 * import { assertEquals, assertThrows } from "@std/assert";
 * import { Pending, Ready, expectReady } from "@sekhmet/enum/poll/mini";
 *
 * assertEquals(expectReady(Ready(42), "value should be ready"), 42);
 * assertThrows(() => expectReady(Pending(), "not yet"), Error, "not yet");
 * ```
 */
export function expectReady<T>(self: Poll<T>, message: string): T {
	assertIsolated(self, "Ready", message);

	return union(self);
}
