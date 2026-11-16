/**
 * Operations for composing and transforming effects.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { Async, Deferred, Ready } from "../../continuation/continuation.ts";
import type { ExecutionContext } from "../../runtime/runtime.ts";
import {
	Effect,
	type EffectOutput,
	type EffectResult,
	ExceptionOccurred,
	Failed,
} from "./effect.ts";

/**
 * Internal helper: runs a step, converting a thrown exception to a Ready ExceptionOccurred.
 */
function attempt<T, E>(step: () => EffectOutput<T, E>): EffectOutput<T, E> {
	try {
		return step();
	} catch (exception: unknown) {
		return Ready(Err(ExceptionOccurred(exception)));
	}
}

/**
 * Internal helper: defers a computation, converting a thrown exception to ExceptionOccurred.
 */
function safeDeferred<T, E>(
	compute: () => EffectOutput<T, E>,
): EffectOutput<T, E> {
	return Deferred(() => attempt(compute));
}

/**
 * Internal helper: creates a new Effect with standardized error handling and continuation traversal.
 * The handler receives both the result and the input; functions that don't need input can ignore it.
 */
function transformEffect<I, T, E, U, F>(
	self: Effect<I, T, E>,
	handleReady: (
		result: EffectResult<T, E>,
		input: I,
		ctx: ExecutionContext,
	) => EffectOutput<U, F>,
): Effect<I, U, F> {
	// Exceptions thrown by `self` at any step become an ExceptionOccurred result
	// that `handleReady` sees, rather than bypassing it.
	return new Effect((input, ctx) => {
		return safeDeferred(() =>
			loop(attempt(() => getStructParams(self)(input, ctx))),
		);

		function loop(output: EffectOutput<T, E>): EffectOutput<U, F> {
			return match(output)({
				Ready: (result) => handleReady(result, input, ctx),
				Async: (continuationFn) => {
					return Async((resolve) => {
						try {
							return continuationFn((continuation) => {
								resolve(loop(continuation));
							});
						} catch (exception: unknown) {
							resolve(loop(Ready(Err(ExceptionOccurred(exception)))));
						}
					});
				},
				Deferred: (continuationFn) =>
					Deferred(() => loop(attempt(continuationFn))),
			});
		}
	});
}

/**
 * Maps the success value of an effect using the provided function.
 *
 * @template I - Input type
 * @template T - Original success type
 * @template E - Error type
 * @template U - New success type
 * @param self - The effect to map
 * @param mapping - Function to transform the success value
 * @returns A new effect with the mapped success value
 *
 * @example
 * ```ts ignore
 * const doubled = map(Success(5), x => x * 2);
 * ```
 */
export function map<I, T, E, U>(
	self: Effect<I, T, E>,
	mapping: (value: T) => U,
): Effect<I, U, E> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => safeDeferred(() => Ready(Ok(mapping(value)))),
			Err: (error) => Ready(Err(error)),
		});
	});
}

/**
 * Maps the success value of an effect, or returns a default value on failure.
 * Exceptions are not caught and propagate as `ExceptionOccurred`.
 *
 * @template I - Input type
 * @template T - Original success type
 * @template E - Error type
 * @template U - New success type
 * @param self - The effect to map
 * @param defaultValue - Value to use when the effect fails
 * @param mapping - Function to transform the success value
 * @returns A new effect that always succeeds
 *
 * @example
 * ```ts ignore
 * const safe = mapOr(effect, 0, x => x * 2);
 * ```
 */
export function mapOr<I, T, E, U>(
	self: Effect<I, T, E>,
	defaultValue: U,
	mapping: (value: T) => U,
): Effect<I, U, never> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => safeDeferred(() => Ready(Ok(mapping(value)))),
			Err: (effectError) => {
				return match(effectError)({
					Failed: () => Ready(Ok(defaultValue)),
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}

/**
 * A pair of handlers for matching both arms of a {@linkcode Result}.
 * Used with {@linkcode mapOrElse} to exhaustively handle success and failure.
 *
 * @template T - Success value type
 * @template E - Error value type
 * @template U - Output type produced by both arms
 */
export interface ResultArms<T, E, U> {
	/**
	 * Handler for the `Ok` variant, receiving the success value.
	 */
	Ok: (value: T) => U;
	/**
	 * Handler for the `Err` variant, receiving the typed error value.
	 */
	Err: (error: E) => U;
}

/**
 * Maps both the success and failure arms of an effect using a pair of handlers.
 * Exceptions still propagate as `ExceptionOccurred` and are not passed to `Err`.
 *
 * @template I - Input type
 * @template T - Original success type
 * @template E - Original error type
 * @template U - Output type produced by both arms
 * @param self - The effect to map
 * @param arms - Handlers for `Ok` and `Err` variants
 * @returns A new effect that always succeeds
 *
 * @example
 * ```ts ignore
 * const result = mapOrElse(effect, {
 *   Ok: value => `success: ${value}`,
 *   Err: error => `failed: ${error}`,
 * });
 * ```
 */
export function mapOrElse<I, T, E, U>(
	self: Effect<I, T, E>,
	arms: ResultArms<T, E, U>,
): Effect<I, U, never> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => safeDeferred(() => Ready(Ok(arms.Ok(value)))),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (error) => safeDeferred(() => Ready(Ok(arms.Err(error)))),
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}

/**
 * Maps the error value of an effect using the provided function.
 *
 * @template I - Input type
 * @template T - Success type
 * @template E - Original error type
 * @template F - New error type
 * @param self - The effect to map
 * @param mapping - Function to transform the error value
 * @returns A new effect with the mapped error value
 *
 * @example
 * ```ts ignore
 * const withErrorCode = mapError(effect, err => ({ code: 500, message: err }));
 * ```
 */
export function mapError<I, T, E, F>(
	self: Effect<I, T, E>,
	mapping: (error: E) => F,
): Effect<I, T, F> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => Ready(Ok(value)),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (err) => safeDeferred(() => Ready(Err(Failed(mapping(err))))),
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}

/**
 * Runs a side-effecting inspector on the success value without altering the effect.
 * If the inspector throws, the exception is captured as `ExceptionOccurred`.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The effect to inspect
 * @param inspector - Function called with the success value for side effects
 * @returns The original effect, unchanged
 *
 * @example
 * ```ts ignore
 * const logged = inspect(effect, value => console.log("got:", value));
 * ```
 */
export function inspect<I, T, E>(
	self: Effect<I, T, E>,
	inspector: (value: T) => void,
): Effect<I, T, E> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => {
				return safeDeferred(() => {
					inspector(value);

					return Ready(Ok(value));
				});
			},
			Err: (effectError) => Ready(Err(effectError)),
		});
	});
}

/**
 * Runs a side-effecting inspector on the typed error value without altering the effect.
 * Only called for `Failed` errors, not for `ExceptionOccurred`.
 * If the inspector throws, the exception is captured as `ExceptionOccurred`.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The effect to inspect
 * @param inspector - Function called with the typed error value for side effects
 * @returns The original effect, unchanged
 *
 * @example
 * ```ts ignore
 * const logged = inspectError(effect, error => console.error("error:", error));
 * ```
 */
export function inspectError<I, T, E>(
	self: Effect<I, T, E>,
	inspector: (error: E) => void,
): Effect<I, T, E> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => Ready(Ok(value)),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (error) => {
						return safeDeferred(() => {
							inspector(error);

							return Ready(Err(Failed(error)));
						});
					},
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}

/**
 * Runs a side-effecting inspector on an `ExceptionOccurred` error without altering the effect.
 * Only called for unhandled exceptions, not for typed `Failed` errors.
 * If the inspector throws, the new exception replaces the original.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 * @param self - The effect to inspect
 * @param inspector - Function called with the thrown exception for side effects
 * @returns The original effect, unchanged
 *
 * @example
 * ```ts ignore
 * const logged = inspectException(effect, ex => console.error("exception:", ex));
 * ```
 */
export function inspectException<I, T, E>(
	self: Effect<I, T, E>,
	inspector: (exception: unknown) => void,
): Effect<I, T, E> {
	return transformEffect(self, (result) => {
		return match(result)({
			Ok: (value) => Ready(Ok(value)),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (error) => Ready(Err(Failed(error))),
					ExceptionOccurred: (exception) => {
						return safeDeferred(() => {
							inspector(exception);

							return Ready(Err(ExceptionOccurred(exception)));
						});
					},
				});
			},
		});
	});
}

/**
 * Sequences two effects, passing the success value of the first as input to the second.
 *
 * @template I - Initial input type
 * @template T - First effect success type (becomes input to second)
 * @template E - Error type
 * @template U - Second effect success type
 * @param self - The first effect
 * @param nextStep - The second effect that receives the first's output
 * @returns A new effect combining both operations
 *
 * @example
 * ```ts ignore
 * const parseAndDouble = and(parseNumber, doubleEffect);
 * ```
 */
export function and<I, T, E, U>(
	self: Effect<I, T, E>,
	nextStep: Effect<T, U, E>,
): Effect<I, U, E> {
	return transformEffect(self, (result, _input, ctx) => {
		return match(result)({
			Ok: (value) => safeDeferred(() => getStructParams(nextStep)(value, ctx)),
			Err: (error) => Ready(Err(error)),
		});
	});
}

/**
 * Sequences two effects where the second effect depends on the success value of the first.
 * Similar to `and`, but the second effect is computed dynamically from the first's result.
 *
 * @template I - Input type
 * @template T - First effect success type
 * @template E - Error type
 * @template U - Second effect success type
 * @param self - The first effect
 * @param nextStep - Function that creates the second effect from the first's success value
 * @returns A new effect combining both operations
 *
 * @example
 * ```ts ignore
 * const chained = andThen(getUser, user => getUserPosts(user.id));
 * ```
 */
export function andThen<I, T, E, U>(
	self: Effect<I, T, E>,
	nextStep: (value: T) => Effect<I, U, E>,
): Effect<I, U, E> {
	return transformEffect(self, (result, input, ctx) => {
		return match(result)({
			Ok: (value) => {
				return safeDeferred(() => {
					return getStructParams(nextStep(value))(input, ctx);
				});
			},
			Err: (error) => Ready(Err(error)),
		});
	});
}

/**
 * Provides a fallback effect that runs if the first effect fails.
 * The error value is passed as input to the fallback effect.
 *
 * @template I - Input type
 * @template T - Success type
 * @template E - First effect error type (becomes input to fallback)
 * @template F - Fallback effect error type
 * @param self - The primary effect
 * @param fallbackStep - The fallback effect that receives the error
 * @returns A new effect that tries the primary and falls back on error
 *
 * @example
 * ```ts ignore
 * const withFallback = or(fetchFromCache, fetchFromNetwork);
 * ```
 */
export function or<I, T, E, F>(
	self: Effect<I, T, E>,
	fallbackStep: Effect<E, T, F>,
): Effect<I, T, F> {
	return transformEffect(self, (result, _input, ctx) => {
		return match(result)({
			Ok: (value) => Ready(Ok(value)),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (error) => {
						return safeDeferred(() => {
							return getStructParams(fallbackStep)(error, ctx);
						});
					},
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}

/**
 * Provides a fallback effect that runs if the first effect fails.
 * Similar to `or`, but the fallback effect is computed dynamically from the error.
 *
 * @template I - Input type
 * @template T - Success type
 * @template E - First effect error type
 * @template F - Fallback effect error type
 * @param self - The primary effect
 * @param fallbackStep - Function that creates the fallback effect from the error
 * @returns A new effect that tries the primary and falls back on error
 *
 * @example
 * ```ts ignore
 * const withRetry = orElse(fetchData, error => retryWithBackoff(error.retryAfter));
 * ```
 */
export function orElse<I, T, E, F>(
	self: Effect<I, T, E>,
	fallbackStep: (error: E) => Effect<I, T, F>,
): Effect<I, T, F> {
	return transformEffect(self, (result, input, ctx) => {
		return match(result)({
			Ok: (value) => Ready(Ok(value)),
			Err: (effectError) => {
				return match(effectError)({
					Failed: (error) => {
						return safeDeferred(() => {
							return getStructParams(fallbackStep(error))(input, ctx);
						});
					},
					ExceptionOccurred: (exception) => {
						return Ready(Err(ExceptionOccurred(exception)));
					},
				});
			},
		});
	});
}
