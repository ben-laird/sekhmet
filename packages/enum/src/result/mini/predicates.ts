/**
 * Testing a result: `isOk`, `isOkAnd`, `isErr` and `isErrAnd`.
 *
 * @module
 */

import type { Enum, Isolate } from "@/src/core/mini/core.ts";
import { isolate, isolateAnd } from "@/src/core/mini/isolate.ts";
import type { Result, ResultVariants } from "./core.ts";

/**
 * Checks if a Result is in the Ok variant.
 *
 * Narrows both the variant and the type parameters: the Result becomes its Ok
 * variant, so its value can be read directly, and a `Result<T, never>`, which
 * fits a Result with any error type.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to check
 * @returns true if the Result is Ok, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Err, Ok, type Result, isOk } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isOk(Ok(42)), true);
 * assertEquals(isOk(Err("failed")), false);
 *
 * const result: Result<number, string> = Ok(42);
 * if (isOk(result)) {
 *   const value: number = union(result); // the variant: result is Ok
 *   const other: Result<number, Error> = result; // the type parameters: a Result<number, never>
 *   assertEquals(value, 42);
 *   assertEquals(other, result);
 * }
 * ```
 */
export function isOk<T, E>(
	self: Result<T, E>,
): self is Enum<Isolate<ResultVariants<T, E>, "Ok">> & Result<T, never> {
	return isolate(self, "Ok");
}

/**
 * Checks if a Result is Ok and its value satisfies a predicate.
 *
 * This combines variant checking with value validation, providing a type guard
 * that narrows both the variant and the type parameters: the Result becomes its
 * Ok variant and a `Result<U, never>`, where `U` is the type a type-guard
 * predicate guards (or `T` for a boolean predicate).
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
 * import { Ok, type Result, isOkAnd } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isOkAnd(Ok(42), (n) => n > 40), true);
 * assertEquals(isOkAnd(Ok(7), (n) => n > 40), false);
 *
 * // With type guard
 * const value: unknown = "hello";
 * const result = Ok(value);
 * if (isOkAnd(result, (v): v is string => typeof v === "string")) {
 *   // the variant: result is Ok holding a string, so no Err arm is needed
 *   const shout = match(result)({ Ok: (v) => v.toUpperCase() });
 *   // the type parameters: result is a Result<string, never>
 *   const narrowed: Result<string, Error> = result;
 *   assertEquals(shout, "HELLO");
 *   assertEquals(narrowed, result);
 * }
 * ```
 */
export function isOkAnd<T, E, U extends T>(
	self: Result<T, E>,
	predicate: ((value: T) => value is U) | ((value: T) => boolean),
): self is Enum<Isolate<ResultVariants<U, E>, "Ok">> & Result<U, never> {
	return isolateAnd(self, "Ok", predicate);
}

/**
 * Checks if a Result is in the Err variant.
 *
 * Narrows both the variant and the type parameters: the Result becomes its Err
 * variant, so its error can be read directly, and a `Result<never, E>`, which
 * fits a Result with any value type.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to check
 * @returns true if the Result is Err, false otherwise
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini";
 * import { Err, Ok, type Result, isErr } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(isErr(Err(new Error("Failed"))), true);
 * assertEquals(isErr(Ok(42)), false);
 *
 * const result: Result<number, string> = Err("failed");
 * if (isErr(result)) {
 *   const error: string = union(result); // the variant: result is Err
 *   const other: Result<boolean, string> = result; // the type parameters: a Result<never, string>
 *   assertEquals(error, "failed");
 *   assertEquals(other, result);
 * }
 * ```
 */
export function isErr<T, E>(
	self: Result<T, E>,
): self is Enum<Isolate<ResultVariants<T, E>, "Err">> & Result<never, E> {
	return isolate(self, "Err");
}

/**
 * Checks if a Result is Err and its error satisfies a predicate.
 *
 * This combines variant checking with error validation, providing a type guard
 * that narrows both the variant and the type parameters: the Result becomes its
 * Err variant and a `Result<never, F>`, where `F` is the type a type-guard
 * predicate guards (or `E` for a boolean predicate).
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
 * import { match } from "@sekhmet/enum/core/mini";
 * import { Err, type Result, isErrAnd } from "@sekhmet/enum/result/mini";
 *
 * const result = Err(new Error("Not found"));
 * assertEquals(isErrAnd(result, (e) => e.message.includes("Not found")), true);
 *
 * // With type guard
 * type NetworkError = { code: number };
 * const result2: Result<string, Error | NetworkError> = Err({ code: 404 });
 * if (isErrAnd(result2, (e): e is NetworkError => "code" in e)) {
 *   // the variant: result2 is Err holding a NetworkError, so no Ok arm is needed
 *   const code = match(result2)({ Err: (e) => e.code });
 *   // the type parameters: result2 is a Result<never, NetworkError>
 *   const narrowed: Result<number, NetworkError> = result2;
 *   assertEquals(code, 404);
 *   assertEquals(narrowed, result2);
 * }
 * ```
 */
export function isErrAnd<T, E, F extends E>(
	self: Result<T, E>,
	predicate: ((value: E) => value is F) | ((value: E) => boolean),
): self is Enum<Isolate<ResultVariants<T, F>, "Err">> & Result<never, F> {
	return isolateAnd(self, "Err", predicate);
}
