/**
 * Core Effect types and constructors.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Struct } from "@sekhmet/primordials/struct";
import type { Continuation } from "./continuation.ts";
import { Ready } from "./continuation.ts";

export function Failed<T>(error: T): EffectError<T> {
	return new EffectError<T>("Failed", error);
}

export function ExceptionOccurred<T>(error: unknown): EffectError<T> {
	return new EffectError<T>("ExceptionOccurred", error);
}

export type EffectErrorVariants<T> = Split<{
	Failed: [error: T];
	ExceptionOccurred: [error: unknown];
}>;

export class EffectError<T> extends Enum<EffectErrorVariants<T>> {}

/**
 * Function that represents an effect computation.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export type EffectFn<I, T, E> = (input: I) => EffectOutput<T, E>;

export type EffectOutput<T, E> = Continuation<EffectResult<T, E>>;

export type EffectResult<T, E> = Result<T, EffectError<E>>;

/**
 * An Effect represents a computation that takes input I, may succeed with value T,
 * or fail with error E. Effects are composable and can be synchronous or asynchronous.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export class Effect<I, T, E> extends Struct<EffectFn<I, T, E>> {}

/**
 * Creates an effect that immediately succeeds with the given value.
 *
 * @template T - Success value type
 * @param value - The success value
 * @returns An effect that produces the success value
 *
 * @example
 * ```ts ignore
 * const effect = Success(42);
 * ```
 */
export function Success<T>(value: T): Effect<void, T, never> {
	return new Effect(() => Ready(Ok(value)));
}

/**
 * Creates an effect that immediately fails with the given error.
 *
 * @template E - Error type
 * @param error - The error value
 * @returns An effect that produces the error
 *
 * @example
 * ```ts ignore
 * const effect = Failure("something went wrong");
 * ```
 */
export function Failure<E>(error: E): Effect<void, never, E> {
	return new Effect(() => Ready(Err(Failed(error))));
}
