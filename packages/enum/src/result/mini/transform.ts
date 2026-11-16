/**
 * Transforming a result: `map`, `mapErr`, `mapOr`, `mapOrElse` and the
 * `inspect` functions.
 *
 * @module
 */

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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, map } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(map(Ok(5), (n) => n * 2), Ok(10));
 *
 * const error: Result<number, string> = Err("failed");
 * assertEquals(map(error, (n) => n * 2), Err("failed"));
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, mapOr } from "@sekhmet/enum/result/mini";
 *
 * assertEquals(mapOr(Ok(5), 0, (n) => n * 2), 10);
 *
 * const error: Result<number, string> = Err("failed");
 * assertEquals(mapOr(error, 0, (n) => n * 2), 0);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, mapOrElse } from "@sekhmet/enum/result/mini";
 *
 * const describe = (result: Result<number, string>): string =>
 *   mapOrElse(result, (n) => `Success: ${n}`, (e) => `Error: ${e}`);
 *
 * assertEquals(describe(Ok(5)), "Success: 5");
 * assertEquals(describe(Err("failed")), "Error: failed");
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, mapErr } from "@sekhmet/enum/result/mini";
 *
 * const error: Result<number, string> = Err("failed");
 * assertEquals(mapErr(error, (e) => e.toUpperCase()), Err("FAILED"));
 *
 * const success: Result<number, string> = Ok(42);
 * assertEquals(mapErr(success, (e) => e.toUpperCase()), Ok(42));
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, inspect } from "@sekhmet/enum/result/mini";
 *
 * const seen: number[] = [];
 *
 * inspect(Ok(42), (value) => seen.push(value)); // records 42
 *
 * const error: Result<number, string> = Err("failed");
 * inspect(error, (value) => seen.push(value)); // does nothing
 *
 * assertEquals(seen, [42]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, type Result, inspectErr } from "@sekhmet/enum/result/mini";
 *
 * const seen: string[] = [];
 *
 * inspectErr(Err("failed"), (err) => seen.push(err)); // records "failed"
 *
 * const success: Result<number, string> = Ok(42);
 * inspectErr(success, (err) => seen.push(err)); // does nothing
 *
 * assertEquals(seen, ["failed"]);
 * ```
 */
export function inspectErr<T, E>(
	self: Result<T, E>,
	inspector: (err: E) => void,
): void {
	inspectIsolated(self, "Err", inspector);
}
