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
 * ```ts ignore
 * import { Ok, type Result } from "@sekhmet/enum/result/mini/core";
 * import { isOk } from "@sekhmet/enum/result/mini/predicates";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 *
 * const result = Ok(42);
 * if (isOk(result)) {
 *   // Use match to access the value
 *   match(result)({
 *     Ok: (value) => console.log(value), // TypeScript knows value is number
 *     Err: () => {}, // This branch is never reached
 *   });
 * }
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
 * ```ts ignore
 * import { Ok, type Result } from "@sekhmet/enum/result/mini/core";
 * import { isOkAnd } from "@sekhmet/enum/result/mini/predicates";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 *
 * const result = Ok(42);
 * if (isOkAnd(result, (n) => n > 40)) {
 *   match(result)({
 *     Ok: (value) => console.log("Large number:", value),
 *     Err: () => {},
 *   });
 * }
 *
 * // With type guard
 * const value: unknown = "hello";
 * const result2 = Ok(value);
 * if (isOkAnd(result2, (v): v is string => typeof v === "string")) {
 *   match(result2)({
 *     Ok: (v) => console.log(v.toUpperCase()), // TypeScript knows v is string
 *     Err: () => {},
 *   });
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
 * ```ts ignore
 * import { Err, type Result } from "@sekhmet/enum/result/mini/core";
 * import { isErr } from "@sekhmet/enum/result/mini/predicates";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 *
 * const result = Err(new Error("Failed"));
 * if (isErr(result)) {
 *   match(result)({
 *     Ok: () => {},
 *     Err: (error) => console.error(error), // TypeScript knows this is safe
 *   });
 * }
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
 * ```ts ignore
 * import { Err, type Result } from "@sekhmet/enum/result/mini/core";
 * import { isErrAnd } from "@sekhmet/enum/result/mini/predicates";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 *
 * const result = Err(new Error("Not found"));
 * if (isErrAnd(result, (e) => e.message.includes("Not found"))) {
 *   console.error("Resource not found");
 * }
 *
 * // With type guard
 * type NetworkError = { code: number };
 * const result2: Result<string, Error | NetworkError> = Err({ code: 404 });
 * if (isErrAnd(result2, (e): e is NetworkError => 'code' in e)) {
 *   match(result2)({
 *     Ok: () => {},
 *     Err: (error) => console.log("Network error code:", error.code),
 *   });
 * }
 * ```
 */
export function isErrAnd<T, E, F extends E>(
	self: Result<T, E>,
	predicate: ((value: E) => value is F) | ((value: E) => boolean),
): self is Result<never, E> {
	return isolateAnd(self, "Err", predicate);
}
