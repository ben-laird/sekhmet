import { match } from "@/src/core/mini/exit.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import type { Option } from "./core.ts";

/**
 * Transforms an Option into a Result, mapping Some(v) to Ok(v) and None to Err(err).
 *
 * This allows converting an optional value into a Result type, providing a specific
 * error value for the None case.
 *
 * @param self - The Option to convert
 * @param err - The error value to use if self is None
 * @returns Ok containing the value if self is Some, otherwise Err containing err
 *
 * @example
 * ```ts ignore
 * okOr(Some(42), "not found"); // Ok(42)
 * okOr(None(), "not found");   // Err("not found")
 * ```
 */
export function okOr<T, E>(self: Option<T>, err: E): Result<T, E> {
	return match(self)({
		Some: (value) => Ok(value),
		None: () => Err(err),
	});
}

/**
 * Transforms an Option into a Result, mapping Some(v) to Ok(v) and None to Err(err()).
 *
 * This allows converting an optional value into a Result type, lazily computing
 * the error value for the None case.
 *
 * @param self - The Option to convert
 * @param err - Function that produces the error value if self is None
 * @returns Ok containing the value if self is Some, otherwise Err containing the result of err()
 *
 * @example
 * ```ts ignore
 * const expensive = () => expensiveErrorComputation();
 *
 * okOrElse(Some(42), expensive); // Ok(42) - expensive() not called
 * okOrElse(None(), expensive);   // Err(result) - expensive() called
 * ```
 */
export function okOrElse<T, E>(self: Option<T>, err: () => E): Result<T, E> {
	return match(self)({
		Some: (value) => Ok(value),
		None: () => Err(err()),
	});
}
