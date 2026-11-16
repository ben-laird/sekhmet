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
						let resolved = false;
						try {
							return continuationFn((continuation) => {
								resolved = true;
								resolve(loop(continuation));
							});
						} catch (exception: unknown) {
							// A throw after resolving is a bug in the effect: rethrow so the
							// fiber panics, exactly as it would for the unwrapped effect.
							if (resolved) throw exception;
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success, map } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const doubled = map(Success(5), (x) => x * 2);
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, doubled), (result) => results.push(result));
 * assertEquals(results, [Ok(10)]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failure, mapOr } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const safe = mapOr(Failure<number>(404), 0, (x: number) => x * 2);
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, safe), (result) => results.push(result));
 * assertEquals(results, [Ok(0)]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failure, mapOrElse } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const message = mapOrElse(Failure("timeout"), {
 *   Ok: (value: number) => `success: ${value}`,
 *   Err: (error) => `failed: ${error}`,
 * });
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, message), (result) => results.push(result));
 * assertEquals(results, [Ok("failed: timeout")]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failure, mapError } from "@sekhmet/effect/effect/mini";
 * import { Failed, fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Err } from "@sekhmet/enum/result/mini";
 *
 * const withCode = mapError(Failure("boom"), (message) => ({ code: 500, message }));
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, withCode), (result) => results.push(result));
 * assertEquals(results, [Err(Failed({ code: 500, message: "boom" }))]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success, inspect } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 *
 * const seen: number[] = [];
 * const logged = inspect(Success(7), (value) => seen.push(value));
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * fork(runtime, logged);
 * assertEquals(seen, [7]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Failure, inspectError } from "@sekhmet/effect/effect/mini";
 * import { fork } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 *
 * const seen: string[] = [];
 * const logged = inspectError(Failure("boom"), (error) => seen.push(error));
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * fork(runtime, logged);
 * assertEquals(seen, ["boom"]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success, inspectException, map } from "@sekhmet/effect/effect/mini";
 * import { fork } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 *
 * const seen: unknown[] = [];
 * const boom = new Error("boom");
 * const throwing = map(Success(1), (): number => {
 *   throw boom;
 * });
 * const logged = inspectException(throwing, (exception) => seen.push(exception));
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * fork(runtime, logged);
 * assertEquals(seen, [boom]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Effect, and } from "@sekhmet/effect/effect/mini";
 * import { Ready } from "@sekhmet/effect/continuation";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const parse = new Effect<string, number, never>((text) => Ready(Ok(Number(text))));
 * const double = new Effect<number, number, never>((n) => Ready(Ok(n * 2)));
 * const parseAndDouble = and(parse, double);
 *
 * const runtime = new Runtime({
 *   input: "21",
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, parseAndDouble), (result) => results.push(result));
 * assertEquals(results, [Ok(42)]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Success, andThen } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const getUser = Success({ id: 1, name: "Ada" });
 * const getPosts = (userId: number) => Success([`post by ${userId}`]);
 * const posts = andThen(getUser, (user) => getPosts(user.id));
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, posts), (result) => results.push(result));
 * assertEquals(results, [Ok(["post by 1"])]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Effect, Failure, or } from "@sekhmet/effect/effect/mini";
 * import { Ready } from "@sekhmet/effect/continuation";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const fromCache: Effect<void, string, string> = Failure("miss");
 * // The fallback receives the first effect's error as its input
 * const fromNetwork = new Effect<string, string, never>((reason) =>
 *   Ready(Ok(`fetched after ${reason}`))
 * );
 * const withFallback = or(fromCache, fromNetwork);
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, withFallback), (result) => results.push(result));
 * assertEquals(results, [Ok("fetched after miss")]);
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
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { type Effect, Failure, Success, orElse } from "@sekhmet/effect/effect/mini";
 * import { fork, join } from "@sekhmet/effect/fiber/mini";
 * import { Runtime } from "@sekhmet/effect/runtime";
 * import { Scheduler, sync } from "@sekhmet/effect/scheduler";
 * import { Ok } from "@sekhmet/enum/result/mini";
 *
 * const fetchData: Effect<void, string, { retryAfter: number }> = Failure({
 *   retryAfter: 30,
 * });
 * const withFallback = orElse(fetchData, (error) =>
 *   Success(`retry in ${error.retryAfter}s`)
 * );
 *
 * const runtime = new Runtime({
 *   input: undefined,
 *   config: { scheduler: new Scheduler({ schedule: sync() }) },
 * });
 * const results: unknown[] = [];
 * join(fork(runtime, withFallback), (result) => results.push(result));
 * assertEquals(results, [Ok("retry in 30s")]);
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
