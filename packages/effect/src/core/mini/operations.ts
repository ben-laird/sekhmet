/**
 * Operations for composing and transforming effects.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { Async, type Continuation, Deferred, Ready } from "./continuation.ts";
import { Effect } from "./effect.ts";

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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Deferred(() => Ready(Ok(mapping(value)))),
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => Deferred(() => Ready(Err(mapping(error)))),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => {
							return Deferred(() => {
								return getStructParams(nextStep)(value);
							});
						},
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<U, E>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => {
							return Deferred(() => {
								return getStructParams(nextStep(value))(input);
							});
						},
						Err: (error) => Ready(Err(error)),
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => {
							return Deferred(() => {
								return getStructParams(fallbackStep)(error);
							});
						},
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
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
	return new Effect((input) => {
		return loop(getStructParams(self)(input));

		function loop(c: Continuation<Result<T, E>>): Continuation<Result<T, F>> {
			return match(c)({
				Ready: (result) => {
					return match(result)({
						Ok: (value) => Ready(Ok(value)),
						Err: (error) => {
							return Deferred(() => {
								return getStructParams(fallbackStep(error))(input);
							});
						},
					});
				},
				Async: (continuationFn) => {
					return Async((resolve) => {
						return continuationFn((continuation) => {
							resolve(loop(continuation));
						});
					});
				},
				Deferred: (continuationFn) => Deferred(() => loop(continuationFn())),
			});
		}
	});
}
