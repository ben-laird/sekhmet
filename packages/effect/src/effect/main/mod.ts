/**
 * Full-featured kitchen-sink exports for the effect module.
 *
 * This module provides a fluent, method-based API for working with effects.
 * It extends the mini {@linkcode mini.Effect} class and wraps each operation
 * from `effect/mini` as an instance method, using the memento pattern to
 * convert results back into main `Effect` instances for chaining.
 *
 * @example
 * ```ts ignore
 * import { Success } from "@sekhmet/effect/effect/main";
 *
 * const result = Success(5)
 *   .map(x => x * 2)
 *   .inspect(x => console.log("value:", x))
 *   .mapError(e => `error: ${e}`);
 * ```
 *
 * @module
 */

import { getStructParams } from "@sekhmet/primordials/struct";
import * as mini from "../mini/mod.ts";

/**
 * Converts a mini Effect into a main Effect using the memento pattern.
 * Extracts the underlying `EffectFn` via `getStructParams` and wraps it
 * in a new `Effect` instance that carries the full method-based API.
 */
function fromMini<I, T, E>(effect: mini.Effect<I, T, E>): Effect<I, T, E> {
	return new Effect(getStructParams(effect));
}

/**
 * Full-featured Effect class providing a fluent, method-based API.
 *
 * This is the "kitchen sink" version of the Effect class that wraps the
 * functional mini exports as instance methods. Each method delegates to its
 * corresponding mini function and returns a main `Effect` for chaining.
 *
 * @template I - Input type
 * @template T - Success value type
 * @template E - Error type
 *
 * @see {@link mini.map} for the functional API
 * @see {@link mini.andThen} for sequencing
 */
export class Effect<I, T, E> extends mini.Effect<I, T, E> {
	/**
	 * Maps the success value of this effect using the provided function.
	 *
	 * @param mapping - Function to transform the success value
	 * @returns A new effect with the mapped success value
	 * @see {@link mini.map}
	 */
	map<U>(mapping: (value: T) => U): Effect<I, U, E> {
		return fromMini(mini.map(this, mapping));
	}

	/**
	 * Maps the success value of this effect, or returns a default value on failure.
	 *
	 * @param defaultValue - Value to use when the effect fails
	 * @param mapping - Function to transform the success value
	 * @returns A new effect that always succeeds
	 * @see {@link mini.mapOr}
	 */
	mapOr<U>(defaultValue: U, mapping: (value: T) => U): Effect<I, U, never> {
		return fromMini(mini.mapOr(this, defaultValue, mapping));
	}

	/**
	 * Maps both the success and failure arms of this effect using a pair of handlers.
	 *
	 * @param arms - Handlers for `Ok` and `Err` variants
	 * @returns A new effect that always succeeds
	 * @see {@link mini.mapOrElse}
	 */
	mapOrElse<U>(arms: mini.ResultArms<T, E, U>): Effect<I, U, never> {
		return fromMini(mini.mapOrElse(this, arms));
	}

	/**
	 * Maps the typed error value of this effect using the provided function.
	 *
	 * @param mapping - Function to transform the error value
	 * @returns A new effect with the mapped error value
	 * @see {@link mini.mapError}
	 */
	mapError<F>(mapping: (error: E) => F): Effect<I, T, F> {
		return fromMini(mini.mapError(this, mapping));
	}

	/**
	 * Runs a side-effecting inspector on the success value without altering the effect.
	 *
	 * @param inspector - Function called with the success value for side effects
	 * @returns This effect, unchanged
	 * @see {@link mini.inspect}
	 */
	inspect(inspector: (value: T) => void): Effect<I, T, E> {
		return fromMini(mini.inspect(this, inspector));
	}

	/**
	 * Runs a side-effecting inspector on the typed error value without altering the effect.
	 * Only called for `Failed` errors, not for `ExceptionOccurred`.
	 *
	 * @param inspector - Function called with the typed error value for side effects
	 * @returns This effect, unchanged
	 * @see {@link mini.inspectError}
	 */
	inspectError(inspector: (error: E) => void): Effect<I, T, E> {
		return fromMini(mini.inspectError(this, inspector));
	}

	/**
	 * Runs a side-effecting inspector on an `ExceptionOccurred` error without altering the effect.
	 * Only called for unhandled exceptions, not for typed `Failed` errors.
	 *
	 * @param inspector - Function called with the thrown exception for side effects
	 * @returns This effect, unchanged
	 * @see {@link mini.inspectException}
	 */
	inspectException(inspector: (exception: unknown) => void): Effect<I, T, E> {
		return fromMini(mini.inspectException(this, inspector));
	}

	/**
	 * Sequences this effect with another, passing the success value as input to the next.
	 *
	 * @param nextStep - The next effect that receives this effect's output
	 * @returns A new effect combining both operations
	 * @see {@link mini.and}
	 */
	and<U>(nextStep: mini.Effect<T, U, E>): Effect<I, U, E> {
		return fromMini(mini.and(this, nextStep));
	}

	/**
	 * Sequences this effect with a dynamically created next effect.
	 *
	 * @param nextStep - Function that creates the next effect from the success value
	 * @returns A new effect combining both operations
	 * @see {@link mini.andThen}
	 */
	andThen<U>(nextStep: (value: T) => mini.Effect<I, U, E>): Effect<I, U, E> {
		return fromMini(mini.andThen(this, nextStep));
	}

	/**
	 * Provides a fallback effect that runs if this effect fails.
	 * The error value is passed as input to the fallback.
	 *
	 * @param fallbackStep - The fallback effect that receives the error
	 * @returns A new effect that tries this and falls back on error
	 * @see {@link mini.or}
	 */
	or<F>(fallbackStep: mini.Effect<E, T, F>): Effect<I, T, F> {
		return fromMini(mini.or(this, fallbackStep));
	}

	/**
	 * Provides a dynamically created fallback effect that runs if this effect fails.
	 *
	 * @param fallbackStep - Function that creates the fallback effect from the error
	 * @returns A new effect that tries this and falls back on error
	 * @see {@link mini.orElse}
	 */
	orElse<F>(
		fallbackStep: (error: E) => mini.Effect<I, T, F>,
	): Effect<I, T, F> {
		return fromMini(mini.orElse(this, fallbackStep));
	}

	/**
	 * Combines this effect with another, running both in parallel via fibers.
	 *
	 * @param other - The second effect to run concurrently
	 * @returns A new effect that succeeds with a tuple of both results
	 * @see {@link mini.zip}
	 */
	zip<U>(other: mini.Effect<I, U, E>): Effect<I, [left: T, right: U], E> {
		return fromMini(mini.zip(this, other));
	}
}
