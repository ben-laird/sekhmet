import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Result } from "./core.ts";

/**
 * Checks if a Result is in the Ok variant.
 *
 * This is a type guard that narrows the Result type to Ok, allowing safe
 * access to the success value.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to check
 * @returns true if the Result is Ok, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, isOk } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isOk(Ok(42)), true);
 * assertEquals(isOk(Err("failed")), false);
 * ```
 */
export function isOk<T, E>(self: Result<T, E>): self is Result<T, never> {
	return isolate(self, "Ok");
}

/**
 * Checks if a Result is Ok and its value satisfies a predicate.
 *
 * This combines variant checking with value validation, providing a type guard
 * that narrows both the variant and the value type.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @template U The narrowed type when the predicate is a type guard
 * @param self The Result to check
 * @param predicate A function that tests the Ok value (may be a type guard)
 * @returns true if the Result is Ok and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Ok, isOkAnd } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isOkAnd(Ok(42), (n) => n > 40), true);
 * assertEquals(isOkAnd(Ok(7), (n) => n > 40), false);
 *
 * // With type guard
 * const value: unknown = "hello";
 * const result = Ok(value);
 * if (isOkAnd(result, (v): v is string => typeof v === "string")) {
 *   const shout = match(result)({
 *     Ok: (v) => v.toUpperCase(), // TypeScript knows v is string
 *     Err: () => "",
 *   });
 *   assertEquals(shout, "HELLO");
 * }
 * ```
 */
export function isOkAnd<T, E, U extends T>(
	self: Result<T, E>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Result<U, never> {
	return isolateAnd(self, "Ok", predicate);
}

/**
 * Checks if a Result is in the Err variant.
 *
 * This is a type guard that narrows the Result type to Err, allowing safe
 * access to the error value.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to check
 * @returns true if the Result is Err, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, isErr } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isErr(Err(new Error("Failed"))), true);
 * assertEquals(isErr(Ok(42)), false);
 * ```
 */
export function isErr<T, E>(self: Result<T, E>): self is Result<never, E> {
	return isolate(self, "Err");
}

/**
 * Checks if a Result is Err and its error satisfies a predicate.
 *
 * This combines variant checking with error validation, providing a type guard
 * that narrows both the variant and the error type.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @template F The narrowed error type when the predicate is a type guard
 * @param self The Result to check
 * @param predicate A function that tests the Err value (may be a type guard)
 * @returns true if the Result is Err and the predicate returns true, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, type Result, isErrAnd } from "@sekhmet/enum/result/mini";
 *
 * const result = Err(new Error("Not found"));
 * assertEquals(isErrAnd(result, (e) => e.message.includes("Not found")), true);
 *
 * // With type guard
 * type NetworkError = { code: number };
 * const result2: Result<string, Error | NetworkError> = Err({ code: 404 });
 * assertEquals(isErrAnd(result2, (e): e is NetworkError => "code" in e), true);
 * ```
 */
export function isErrAnd<T, E, F extends E>(
	self: Result<T, E>,
	predicate: ((value: E) => value is F) | ((value: E) => boolean),
): self is Result<never, E> {
	return isolateAnd(self, "Err", predicate);
}
