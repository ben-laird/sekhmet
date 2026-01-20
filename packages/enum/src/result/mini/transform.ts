import { match } from "@/src/core/mini/exit.ts";
import { inspectIsolated } from "@/src/core/mini/isolate.ts";
import { Err, Ok, type Result } from "./core.ts";

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
