import { None, type Option, Some } from "@/src/option/mini/core.ts";
import { match } from "@/src/core/mini/exit.ts";
import { iterIsolated } from "@/src/core/mini/isolate.ts";
import { Err, Ok, type Result } from "./core.ts";

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
 * Returns an iterator over the success value, if present.
 *
 * If the Result is Ok, yields the success value once. If the Result is Err,
 * yields nothing. This is useful for integrating with iteration protocols
 * and for-of loops.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 * @param self The Result to iterate over
 * @returns A generator that yields the success value if Ok, or nothing if Err
 *
 * @example
 * ```ts ignore
 * const success = Ok(42);
 * for (const value of iter(success)) {
 *   console.log(value); // Logs 42
 * }
 *
 * const error = Err("failed");
 * for (const value of iter(error)) {
 *   console.log(value); // Never executes
 * }
 * ```
 */
export function* iter<T, E>(self: Result<T, E>): Generator<T, void, undefined> {
	yield* iterIsolated(self, "Ok");
}

/**
 * Returns the second Result if this one is Ok, otherwise returns the Err.
 *
 * This is useful for chaining operations where you want to require both
 * Results to succeed. If `self` is Err, it short-circuits and returns that error.
 *
 * @template T The type of the first success value
 * @template E The type of the error value (shared by both Results)
 * @template U The type of the second success value
 * @param self The first Result to check
 * @param res The Result to return if `self` is Ok
 * @returns `res` if `self` is Ok, otherwise the error from `self`
 *
 * @example
 * ```ts ignore
 * const first = Ok(1);
 * const second = Ok(2);
 * const result = and(first, second); // Ok(2)
 *
 * const error = Err("failed");
 * const result2 = and(error, second); // Err("failed")
 *
 * const result3 = and(first, Err("second failed")); // Err("second failed")
 * ```
 */
export function and<T, E, U>(
	self: Result<T, E>,
	res: Result<U, E>,
): Result<U, E> {
	return match(self)({
		Ok: () => res,
		Err,
	});
}

/**
 * Chains a computation that may fail onto a Result.
 *
 * If the Result is Ok, applies the function to the success value and returns
 * the resulting Result. If the Result is Err, returns the error unchanged.
 * This is also known as "flatMap" or "bind" in other functional programming contexts.
 *
 * @template T The type of the original success value
 * @template E The type of the error value
 * @template U The type of the new success value
 * @param self The Result to chain from
 * @param res A function that takes the success value and returns a new Result
 * @returns The Result from the function if Ok, otherwise the original error
 *
 * @example
 * ```ts ignore
 * const parseNumber = (s: string): Result<number, string> => {
 *   const n = parseInt(s, 10);
 *   return isNaN(n) ? Err("not a number") : Ok(n);
 * };
 *
 * const double = (n: number): Result<number, string> =>
 *   n > 100 ? Err("too large") : Ok(n * 2);
 *
 * const result = andThen(parseNumber("42"), double); // Ok(84)
 * const result2 = andThen(parseNumber("abc"), double); // Err("not a number")
 * const result3 = andThen(parseNumber("200"), double); // Err("too large")
 * ```
 */
export function andThen<T, E, U>(
	self: Result<T, E>,
	res: (value: T) => Result<U, E>,
): Result<U, E> {
	return match(self)({
		Ok: res,
		Err,
	});
}

/**
 * Returns this Result if Ok, otherwise returns the provided fallback Result.
 *
 * This is useful for providing a backup Result when the first one fails.
 * The error type can change since we're replacing the error with a new Result.
 *
 * @template T The type of the success value (shared by both Results)
 * @template E The type of the original error value
 * @template F The type of the fallback error value
 * @param self The first Result to check
 * @param res The fallback Result to return if `self` is Err
 * @returns `self` if Ok, otherwise `res`
 *
 * @example
 * ```ts ignore
 * const primary = Ok(1);
 * const fallback = Ok(2);
 * const result = or(primary, fallback); // Ok(1)
 *
 * const error = Err("primary failed");
 * const result2 = or(error, fallback); // Ok(2)
 *
 * const result3 = or(error, Err("fallback also failed")); // Err("fallback also failed")
 * ```
 */
export function or<T, E, F>(
	self: Result<T, E>,
	res: Result<T, F>,
): Result<T, F> {
	return match(self)({
		Ok,
		Err: () => res,
	});
}

/**
 * Chains a recovery computation onto an error Result.
 *
 * If the Result is Err, applies the function to the error value and returns
 * the resulting Result (which may succeed or fail with a different error type).
 * If the Result is Ok, returns the success value unchanged.
 *
 * @template T The type of the success value
 * @template E The type of the original error value
 * @template F The type of the new error value
 * @param self The Result to recover from
 * @param res A function that takes the error value and returns a new Result
 * @returns `self` if Ok, otherwise the Result from the recovery function
 *
 * @example
 * ```ts ignore
 * const fetchFromPrimary = (): Result<string, "network"> => Err("network");
 * const fetchFromBackup = (err: "network"): Result<string, "backup-failed"> =>
 *   err === "network" ? Ok("data from backup") : Err("backup-failed");
 *
 * const result = orElse(fetchFromPrimary(), fetchFromBackup); // Ok("data from backup")
 *
 * const success = Ok("primary data");
 * const result2 = orElse(success, fetchFromBackup); // Ok("primary data")
 * ```
 */
export function orElse<T, E, F>(
	self: Result<T, E>,
	res: (err: E) => Result<T, F>,
): Result<T, F> {
	return match(self)({
		Ok,
		Err: res,
	});
}
