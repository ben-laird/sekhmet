import { match } from "@sekhmet/enum/core/mini/exit";
import {
	inspectIsolated,
	isolate,
	isolateAnd,
} from "@sekhmet/enum/core/mini/isolate";

import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { Err, Ok, type Result } from "./core.ts";

// TODO - impl the rest of Result functions

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
 * import { isOk } from "@sekhmet/enum/result/mini/impl";
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
 * import { isOkAnd } from "@sekhmet/enum/result/mini/impl";
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
 * import { isErr } from "@sekhmet/enum/result/mini/impl";
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
 * import { isErrAnd } from "@sekhmet/enum/result/mini/impl";
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

/**
 * Converts a Result to an Option containing the success value.
 *
 * Transforms `Ok(value)` into `Some(value)` and `Err(_)` into `None`,
 * discarding any error information.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to convert
 * @returns Some containing the value if Ok, None if Err
 *
 * @example
 * ```ts ignore
 * const success = Ok(42);
 * const option1 = ok(success); // Some(42)
 *
 * const failure = Err("error");
 * const option2 = ok(failure); // None
 * ```
 */
export function ok<T, E>(self: Result<T, E>): Option<T> {
	return match(self)({
		Ok: (value) => Some(value),
		Err: () => None(),
	});
}

/**
 * Converts a Result to an Option containing the error value.
 *
 * Transforms `Err(error)` into `Some(error)` and `Ok(_)` into `None`,
 * discarding any success value.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to convert
 * @returns Some containing the error if Err, None if Ok
 *
 * @example
 * ```ts ignore
 * const failure = Err("error");
 * const option1 = err(failure); // Some("error")
 *
 * const success = Ok(42);
 * const option2 = err(success); // None
 * ```
 */
export function err<T, E>(self: Result<T, E>): Option<E> {
	return match(self)({
		Ok: () => None(),
		Err: (err) => Some(err),
	});
}

/**
 * Maps a Result's success value by applying a function to it.
 *
 * If the Result is Ok, applies the mapping function to transform the value.
 * If the Result is Err, passes through the error unchanged.
 *
 * @template T The type of the original success value
 * @template E The type of the error value
 * @template U The type of the mapped success value
 * @param self The Result to map
 * @param mapping A function that transforms the success value
 * @returns A new Result with the mapped value if Ok, or the original error if Err
 *
 * @example
 * ```ts ignore
 * const result = Ok(5);
 * const doubled = map(result, (n) => n * 2); // Ok(10)
 *
 * const error = Err("failed");
 * const mapped = map(error, (n) => n * 2); // Err("failed")
 * ```
 */
export function map<T, E, U>(
	self: Result<T, E>,
	mapping: (value: T) => U,
): Result<U, E> {
	return match(self)({
		Ok: (value) => Ok(mapping(value)),
		Err,
	});
}

/**
 * Maps a Result's success value or returns a default value.
 *
 * If the Result is Ok, applies the mapping function to the value and returns the result.
 * If the Result is Err, returns the provided default value.
 *
 * @template T The type of the original success value
 * @template E The type of the error value
 * @template U The type of the mapped value and default value
 * @param self The Result to map
 * @param defaultValue The value to return if the Result is Err
 * @param mapping A function that transforms the success value
 * @returns The mapped success value if Ok, or the default value if Err
 *
 * @example
 * ```ts ignore
 * const result = Ok(5);
 * const doubled = mapOr(result, 0, (n) => n * 2); // 10
 *
 * const error = Err("failed");
 * const fallback = mapOr(error, 0, (n) => n * 2); // 0
 * ```
 */
export function mapOr<T, E, U>(
	self: Result<T, E>,
	defaultValue: U,
	mapping: (value: T) => U,
): U {
	return match(self)({
		Ok: mapping,
		Err: () => defaultValue,
	});
}

/**
 * Maps a Result by applying different functions to success and error values.
 *
 * Applies the okMapping function if the Result is Ok, or the errMapping function
 * if the Result is Err. Both functions must return the same type.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @template U The type returned by both mapping functions
 * @param self The Result to map
 * @param okMapping A function that transforms the success value
 * @param errMapping A function that transforms the error value
 * @returns The result of applying the appropriate mapping function
 *
 * @example
 * ```ts ignore
 * const result = Ok(5);
 * const message = mapOrElse(
 *   result,
 *   (n) => `Success: ${n}`,
 *   (e) => `Error: ${e}`
 * ); // "Success: 5"
 *
 * const error = Err("failed");
 * const errorMsg = mapOrElse(
 *   error,
 *   (n) => `Success: ${n}`,
 *   (e) => `Error: ${e}`
 * ); // "Error: failed"
 * ```
 */
export function mapOrElse<T, E, U>(
	self: Result<T, E>,
	okMapping: (value: T) => U,
	errMapping: (value: E) => U,
): U {
	return match(self)({
		Ok: okMapping,
		Err: errMapping,
	});
}

/**
 * Maps a Result's error value by applying a function to it.
 *
 * If the Result is Err, applies the mapping function to transform the error.
 * If the Result is Ok, passes through the success value unchanged.
 *
 * @template T The type of the success value
 * @template E The type of the original error value
 * @template F The type of the mapped error value
 * @param self The Result to map
 * @param mapping A function that transforms the error value
 * @returns A new Result with the original value if Ok, or the mapped error if Err
 *
 * @example
 * ```ts ignore
 * const error = Err("failed");
 * const wrapped = mapErr(error, (e) => new Error(e)); // Err(Error("failed"))
 *
 * const success = Ok(42);
 * const unchanged = mapErr(success, (e) => new Error(e)); // Ok(42)
 * ```
 */
export function mapErr<T, E, F>(
	self: Result<T, E>,
	mapping: (err: E) => F,
): Result<T, F> {
	return match(self)({
		Ok,
		Err: (err) => Err(mapping(err)),
	});
}

/**
 * Calls a function with the success value for side effects, if Ok.
 *
 * This function allows you to perform side effects (like logging or debugging)
 * on the success value without consuming or modifying the Result. If the Result
 * is Err, the inspector function is not called.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to inspect
 * @param inspector A function that receives the success value and performs side effects
 * @returns void
 *
 * @example
 * ```ts ignore
 * const result = Ok(42);
 * inspect(result, (value) => console.log("Debug:", value)); // Logs "Debug: 42"
 *
 * const error = Err("failed");
 * inspect(error, (value) => console.log("Debug:", value)); // Does nothing
 * ```
 */
export function inspect<T, E>(
	self: Result<T, E>,
	inspector: (value: T) => void,
): void {
	inspectIsolated(self, "Ok", inspector);
}

/**
 * Calls a function with the error value for side effects, if Err.
 *
 * This function allows you to perform side effects (like logging or debugging)
 * on the error value without consuming or modifying the Result. If the Result
 * is Ok, the inspector function is not called.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to inspect
 * @param inspector A function that receives the error value and performs side effects
 * @returns void
 *
 * @example
 * ```ts ignore
 * const error = Err("failed");
 * inspectErr(error, (err) => console.error("Error:", err)); // Logs "Error: failed"
 *
 * const success = Ok(42);
 * inspectErr(success, (err) => console.error("Error:", err)); // Does nothing
 * ```
 */
export function inspectErr<T, E>(
	self: Result<T, E>,
	inspector: (err: E) => void,
): void {
	inspectIsolated(self, "Err", inspector);
}
