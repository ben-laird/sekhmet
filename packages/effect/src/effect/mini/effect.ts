/**
 * Core Effect types and constructors.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Struct } from "@sekhmet/primordials/struct";
import type { ExecutionContext } from "@/src/runtime/runtime.ts";
import type { Continuation } from "../../continuation/continuation.ts";
import { Ready } from "../../continuation/continuation.ts";

/**
 * Creates an `EffectError` representing a typed failure.
 *
 * @template T - The error value type
 * @param error - The error value
 * @returns An `EffectError` in the `Failed` variant
 */
export function Failed<T>(error: T): EffectError<T> {
	return new EffectError<T>("Failed", error);
}

/**
 * Creates an `EffectError` representing an unhandled exception (thrown value).
 *
 * @template T - The typed error type (unused in this variant)
 * @param error - The thrown exception
 * @returns An `EffectError` in the `ExceptionOccurred` variant
 */
export function ExceptionOccurred<T>(error: unknown): EffectError<T> {
	return new EffectError<T>("ExceptionOccurred", error);
}

/**
 * Variant definitions for {@linkcode EffectError}.
 *
 * - `Failed`: A typed error value of type `T`
 * - `ExceptionOccurred`: An unhandled exception (any thrown value)
 *
 * @template T - The typed error value type
 */
export type EffectErrorVariants<T> = Split<{
	Failed: [error: T];
	ExceptionOccurred: [error: unknown];
}>;

/**
 * Represents the error channel of an effect.
 * An `EffectError` is either a typed `Failed` value or an `ExceptionOccurred`
 * wrapping an unexpected thrown exception.
 *
 * @template T - The typed error value type
 */
export class EffectError<T> extends Enum<EffectErrorVariants<T>> {}

/**
 * Function that represents an effect computation.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 */
export type EffectFn<I, T, E> = (
	input: I,
	ctx: ExecutionContext,
) => EffectOutput<T, E>;

/**
 * The continuation type produced by an effect computation.
 * Wraps an {@linkcode EffectResult} in a {@linkcode Continuation} to support
 * synchronous, deferred, and asynchronous execution.
 *
 * @template T - Success value type
 * @template E - Error value type
 */
export type EffectOutput<T, E> = Continuation<EffectResult<T, E>>;

/**
 * The result type of a completed effect computation.
 * Either `Ok<T>` on success or `Err<EffectError<E>>` on failure.
 *
 * @template T - Success value type
 * @template E - Error value type
 */
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, Success(42)), (result) => results.push(result));
 * assertEquals(results, [Ok(42)]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failure } from "@sekhmet/effect/effect/mini";
 * import { Failed, fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Err } from "@sekhmet/enum/result/mini";
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, Failure("something went wrong")), (result) => results.push(result));
 * assertEquals(results, [Err(Failed("something went wrong"))]);
 * ```
 */
export function Failure<E>(error: E): Effect<void, never, E> {
	return new Effect(() => Ready(Err(Failed(error))));
}
