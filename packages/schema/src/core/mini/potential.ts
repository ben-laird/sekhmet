import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";

/**
 * Represents a value that may be available synchronously or asynchronously.
 *
 * @template T The type of the contained value
 */
export type PotentialVariants<T> = Split<{
	Sync: [value: T];
	Async: [promise: Promise<T>];
}>;

/**
 * A value that may be synchronous or asynchronous.
 *
 * This type encapsulates the distinction between immediately available values
 * and values that require asynchronous resolution.
 *
 * @template T The type of the contained value
 */
export class Potential<T> extends Enum<PotentialVariants<T>> {}

/**
 * Creates a Potential containing a synchronous value.
 *
 * @template T The type of the value
 * @param value The synchronous value to wrap
 * @returns A Potential wrapping the synchronous value
 */
export function Sync<T>(value: T): Potential<T> {
	return new Potential<T>("Sync", value);
}

/**
 * Creates a Potential containing an asynchronous promise.
 *
 * @template T The type of the promised value
 * @param promise The promise to wrap
 * @returns A Potential wrapping the promise
 */
export function Async<T>(promise: Promise<T>): Potential<T> {
	return new Potential<T>("Async", promise);
}

/**
 * A type that represents either a synchronous value or a promise of that value.
 *
 * @template T The type of the value
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Converts a MaybePromise into a Potential.
 *
 * This function detects whether the input is a promise and wraps it
 * in the appropriate Potential variant.
 *
 * @template T The type of the value
 * @param value The value or promise to convert
 * @returns A Potential wrapping the input
 */
export function from<T>(value: MaybePromise<T>): Potential<T> {
	if (value instanceof Promise) {
		return Async(value);
	}

	return Sync(value);
}

/**
 * Maps a Potential's value through a transformation function.
 *
 * The mapping function may return either a synchronous value or a promise.
 * If the input is synchronous and the mapping returns synchronous, the result is synchronous.
 * Otherwise, the result is asynchronous.
 *
 * @template T The type of the input value
 * @template U The type of the output value
 * @param self The Potential to map
 * @param mapping The transformation function
 * @returns A new Potential with the transformed value
 */
export function map<T, U>(
	self: Potential<T>,
	mapping: (value: T) => U | Promise<U>,
): Potential<U> {
	return match(self)({
		Sync: (value) => from(mapping(value)),
		Async: (promisedValue) => {
			return Async(promisedValue.then((value) => mapping(value)));
		},
	});
}
