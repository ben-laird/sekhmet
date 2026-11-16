import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";

/**
 * Represents a value that may be available synchronously or asynchronously.
 *
 * @template T The type of the contained value
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { PotentialVariants } from "@sekhmet/schema/core/mini";
 *
 * type Variants = PotentialVariants<number>;
 * assertType<IsExact<Variants, [kind: "Sync", value: number] | [kind: "Async", promise: Promise<number>]>>(true);
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 * import { Sync } from "@sekhmet/schema/core/mini";
 *
 * const timing = match(Sync(1))({
 * 	Sync: () => "now",
 * 	Async: () => "later",
 * });
 * assertEquals(timing, "now");
 * ```
 */
export class Potential<T> extends Enum<PotentialVariants<T>> {}

/**
 * Creates a Potential containing a synchronous value.
 *
 * @template T The type of the value
 * @param value The synchronous value to wrap
 * @returns A Potential wrapping the synchronous value
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { Sync } from "@sekhmet/schema/core/mini";
 *
 * assertEquals(union(Sync(42)), 42);
 * ```
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { Async } from "@sekhmet/schema/core/mini";
 *
 * assertEquals(await union(Async(Promise.resolve(42))), 42);
 * ```
 */
export function Async<T>(promise: Promise<T>): Potential<T> {
	return new Potential<T>("Async", promise);
}

/**
 * A value, or a promise-like (any thenable) of that value.
 *
 * @template T The type of the value
 *
 * @example
 * ```ts
 * import type { MaybePromise } from "@sekhmet/schema/core/mini";
 *
 * const now: MaybePromise<number> = 1;
 * const later: MaybePromise<number> = Promise.resolve(1);
 * ```
 */
export type MaybePromise<T> = T | PromiseLike<T>;

/**
 * Whether a value is promise-like: an object or function with a callable
 * `then`, as `await` and `Promise.resolve` treat it.
 */
function isPromiseLike<T>(value: MaybePromise<T>): value is PromiseLike<T> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}

/**
 * Converts a MaybePromise into a Potential.
 *
 * Any promise-like value (a `Promise` or another thenable) becomes `Async`,
 * normalised to a `Promise` with `Promise.resolve`; anything else is `Sync`.
 *
 * @template T The type of the value
 * @param value The value or promise-like to convert
 * @returns A Potential wrapping the input
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { from } from "@sekhmet/schema/core/mini/potential";
 *
 * assertEquals(unionKinds(from(42)), "Sync");
 * assertEquals(unionKinds(from(Promise.resolve(42))), "Async");
 *
 * const thenable: PromiseLike<number> = {
 * 	then: (onFulfilled, onRejected) =>
 * 		Promise.resolve(42).then(onFulfilled, onRejected),
 * };
 * assertEquals(unionKinds(from(thenable)), "Async");
 * ```
 */
export function from<T>(value: MaybePromise<T>): Potential<T> {
	if (isPromiseLike(value)) {
		return Async(Promise.resolve(value));
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
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union, unionKinds } from "@sekhmet/enum/core/mini/exit";
 * import { mapPotential, Sync } from "@sekhmet/schema/core/mini";
 *
 * const doubled = mapPotential(Sync(21), (n) => n * 2);
 * assertEquals(union(doubled), 42);
 *
 * const fetched = mapPotential(Sync(21), (n) => Promise.resolve(n * 2));
 * assertEquals(unionKinds(fetched), "Async");
 * ```
 */
export function map<T, U>(
	self: Potential<T>,
	mapping: (value: T) => MaybePromise<U>,
): Potential<U> {
	return match(self)({
		Sync: (value) => from(mapping(value)),
		Async: (promisedValue) => {
			return Async(promisedValue.then((value) => mapping(value)));
		},
	});
}
