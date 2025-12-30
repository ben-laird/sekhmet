import { Enum, type Split } from "@/src/core/mini/core.ts";

/**
 * Creates a successful `Result` containing a value.
 *
 * This constructor represents the success case in error handling, wrapping a
 * successful computation's return value.
 *
 * @template T The type of the success value
 * @template E The type of the error (defaults to never since Ok never contains an error)
 * @param value The success value to wrap
 * @returns A Result in the Ok variant containing the value
 *
 * @example
 * ```ts
 * const success = Ok(42);
 * const withError = Ok<number, Error>(42);
 * ```
 */
export function Ok<T = unknown, E = never>(value: T): Result<T, E> {
	return new Result<T, E>("Ok", value);
}

/**
 * Creates a failed `Result` containing an error.
 *
 * This constructor represents the error case in error handling, wrapping a
 * failure value or error object.
 *
 * @template T The type of the success value (defaults to never since Err never contains a success value)
 * @template E The type of the error
 * @param err The error value to wrap
 * @returns A Result in the Err variant containing the error
 *
 * @example
 * ```ts
 * const failure = Err(new Error("Something went wrong"));
 * const withOk = Err<string, Error>(new Error("Failed"));
 * ```
 */
export function Err<T = never, E = unknown>(err: E): Result<T, E> {
	return new Result<T, E>("Err", err);
}

/**
 * Internal type representing the variant structure of a Result.
 *
 * This type splits the Result's variants into a format compatible with the
 * Enum framework:
 * - Ok variant: Contains a single value of type T
 * - Err variant: Contains a single error of type E
 *
 * @template T The type of the success value
 * @template E The type of the error value
 */
type Variants<T, E> = Split<{ Ok: [value: T]; Err: [err: E] }>;

/**
 * Type alias exposing the internal variant structure of Result.
 *
 * This allows external code to reference Result's variant types when needed
 * for advanced type manipulations.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 */
export type { Variants as ResultVariants };

/**
 * A type representing either a success value or an error.
 *
 * `Result<T, E>` is a Rust-inspired type for explicit error handling that
 * forces the caller to handle both success and error cases. It has two variants:
 * - `Ok(value)`: Contains a success value of type T
 * - `Err(error)`: Contains an error value of type E
 *
 * This is an alternative to throwing exceptions, making error handling explicit
 * in the type system.
 *
 * @template T The type of the success value
 * @template E The type of the error value
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err("Division by zero");
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (isOk(result)) {
 *   console.log("Success:", result.value); // TypeScript knows this is Ok
 * }
 * ```
 */
export class Result<out T, out E> extends Enum<Variants<T, E>> {}
