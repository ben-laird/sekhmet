/**
 * FiberError enum and constructors for fiber failure modes.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import type { Result } from "@sekhmet/enum/result/mini";

/**
 * Variant definitions for {@linkcode FiberError}.
 *
 * - `Failed`: A typed error value of type `T`
 * - `Cancelled`: The fiber was cancelled before completing
 * - `Panicked`: An unhandled exception was thrown during execution
 *
 * @template T - The typed error value type
 */
export type FiberErrorVariants<T> = Split<{
	Failed: [error: T];
	Cancelled: [];
	Panicked: [exception: unknown];
}>;

/**
 * Represents the error channel of a completed fiber.
 * A `FiberError` is either a typed `Failed` value, a `Cancelled` signal,
 * or a `Panicked` wrapping an unexpected thrown exception.
 *
 * @template T - The typed error value type
 */
export class FiberError<T> extends Enum<FiberErrorVariants<T>> {}

/**
 * The result type of a completed fiber.
 * Either `Ok<T>` on success or `Err<FiberError<E>>` on failure.
 *
 * @template T - Success value type
 * @template E - Error value type
 */
export type FiberResult<T, E> = Result<T, FiberError<E>>;

/**
 * Creates a {@linkcode FiberError} in the `Failed` variant, representing a typed error.
 *
 * @template T - The error value type
 * @param error - The typed error value
 * @returns A `FiberError` in the `Failed` variant
 */
export function Failed<T>(error: T): FiberError<T> {
	return new FiberError<T>("Failed", error);
}

/**
 * Creates a {@linkcode FiberError} in the `Cancelled` variant, representing a cancelled fiber.
 *
 * @template T - The error value type (unused in this variant)
 * @returns A `FiberError` in the `Cancelled` variant
 */
export function Cancelled<T>(): FiberError<T> {
	return new FiberError<T>("Cancelled");
}

/**
 * Creates a {@linkcode FiberError} in the `Panicked` variant, representing an unhandled exception.
 *
 * @template T - The error value type (unused in this variant)
 * @param exception - The thrown exception
 * @returns A `FiberError` in the `Panicked` variant
 */
export function Panicked<T>(exception: unknown): FiberError<T> {
	return new FiberError<T>("Panicked", exception);
}
