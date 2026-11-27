/**
 * Creating and combining vows: `vowWithResolver`, `resolved`, `map`,
 * `andThen`, `zip`, `zipWith`, `all` and `wait`.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { type Resolver, Vow } from "./core.ts";

/**
 * The result of calling vowWithResolver, containing both the vow and its resolver.
 *
 * @template T The type of the resolved value
 */
export interface VowWithResolver<T> {
	/** Function to resolve the vow with a value */
	resolve: Resolver<T>;
	/** The vow that will be resolved */
	vow: Vow<T>;
}

/**
 * Creates a Vow along with its resolver function for deferred resolution.
 *
 * This is useful when you need to create a vow that will be resolved later
 * by external code, rather than resolved immediately in the executor.
 *
 * @template T The type of the resolved value
 * @returns An object containing the vow and its resolve function
 *
 * @example
 * ```ts
 * import { map, vowWithResolver, wait } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const { vow, resolve } = vowWithResolver<string>();
 *
 * // Set up what happens when resolved
 * const message = map(vow, (value) => `Got: ${value}`);
 *
 * // Later, resolve it
 * resolve("hello world");
 * assertEquals(await wait(message), "Got: hello world");
 * ```
 */
export function vowWithResolver<T>(): VowWithResolver<T> {
	let resolve!: Resolver<T>;

	const vow = new Vow<T>((res) => {
		resolve = res;
	});

	return { resolve, vow };
}

/**
 * Creates a Vow that is immediately resolved with the given value.
 *
 * This is a convenience function for creating a Vow when you already
 * have the resolved value available.
 *
 * @template T The type of the resolved value
 * @param value The value to resolve the vow with
 * @returns A Vow that is already in the Resolved state
 *
 * @example
 * ```ts
 * import { map, resolved } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const vow = resolved(42);
 *
 * // The vow is already resolved, so the mapping runs immediately
 * const seen: number[] = [];
 * map(vow, (n) => seen.push(n));
 * assertEquals(seen, [42]);
 * ```
 */
export function resolved<T>(value: T): Vow<T> {
	return new Vow((resolve) => resolve(value));
}

/**
 * Transforms the resolved value of a Vow using a mapping function.
 *
 * Creates a new Vow that will resolve with the result of applying the
 * mapping function to the original Vow's resolved value. If the original
 * Vow is already resolved, the mapping runs immediately.
 *
 * @template T The type of the original resolved value
 * @template U The type of the transformed value
 * @param self The Vow to transform
 * @param mapping Function to transform the resolved value
 * @returns A new Vow containing the transformed value
 *
 * @example
 * ```ts
 * import { map, resolved, wait } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const numberVow = resolved(5);
 * const stringVow = map(numberVow, (n) => `Value is ${n}`);
 *
 * assertEquals(await wait(stringVow), "Value is 5");
 * ```
 */
export function map<T, U>(self: Vow<T>, mapping: (value: T) => U): Vow<U> {
	return new Vow<U>((resolve) => {
		match(self)({
			Pending: (subscribe) => subscribe(resolveMap),
			Resolved: resolveMap,
		});

		function resolveMap(value: T): void {
			resolve(mapping(value));
		}
	});
}

/**
 * Chains a step that returns a Vow, flattening the result.
 *
 * Creates a new Vow that resolves with the value of the Vow `next` returns
 * for `self`'s resolved value. This is commonly called "flatMap". When
 * `self` is resolved and `next` returns a resolved Vow, the result is
 * resolved before `andThen` returns: the chain stays synchronous as long as
 * every step is.
 *
 * @template T The type of the original resolved value
 * @template U The type of the chained Vow's resolved value
 * @param self The Vow to chain from
 * @param next Function from the resolved value to the next Vow
 * @returns A Vow that resolves with the value of `next`'s Vow
 *
 * @example
 * ```ts
 * import { andThen, map, resolved, vowWithResolver } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const { vow: userId, resolve: setUserId } = vowWithResolver<number>();
 * const { vow: profile, resolve: setProfile } = vowWithResolver<string>();
 *
 * // The second step is itself a vow
 * const greeting = andThen(userId, (id) => {
 *   return map(profile, (name) => `#${id}: ${name}`);
 * });
 * const seen: string[] = [];
 * map(greeting, (text) => seen.push(text));
 *
 * setUserId(7);
 * assertEquals(seen, []); // waiting for the profile
 * setProfile("Ada");
 * assertEquals(seen, ["#7: Ada"]);
 *
 * // With every step resolved, the chain resolves synchronously
 * const sync: number[] = [];
 * map(andThen(resolved(2), (n) => resolved(n * 10)), (n) => sync.push(n));
 * assertEquals(sync, [20]);
 * ```
 */
export function andThen<T, U>(
	self: Vow<T>,
	next: (value: T) => Vow<U>,
): Vow<U> {
	return new Vow<U>((resolve) => {
		match(self)({
			Pending: (subscribe) => subscribe(resolveNext),
			Resolved: resolveNext,
		});

		function resolveNext(value: T): void {
			const chained = next(value);

			match(chained)({
				Pending: (subscribe) => subscribe(resolve),
				Resolved: resolve,
			});
		}
	});
}

/**
 * Combines two Vows into a single Vow containing a tuple of both values.
 *
 * The resulting Vow resolves only when both input Vows have resolved.
 * If both are already resolved, the result resolves immediately.
 *
 * @template T The type of the first Vow's resolved value
 * @template U The type of the second Vow's resolved value
 * @param self The first Vow
 * @param otherVow The second Vow
 * @returns A Vow that resolves with a tuple of both values
 *
 * @example
 * ```ts
 * import { resolved, vowWithResolver, wait, zip } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const nameVow = resolved("Alice");
 * const { vow: ageVow, resolve: resolveAge } = vowWithResolver<number>();
 *
 * // Resolves only once both inputs have resolved
 * const combined = zip(nameVow, ageVow);
 * resolveAge(30);
 *
 * assertEquals(await wait(combined), ["Alice", 30]);
 * ```
 */
export function zip<T, U>(
	self: Vow<T>,
	otherVow: Vow<U>,
): Vow<[first: T, second: U]> {
	return new Vow((resolve) => {
		function tryResolve() {
			if (isolate(self, "Resolved") && isolate(otherVow, "Resolved")) {
				resolve([union(self), union(otherVow)]);
			}
		}

		match(self)({
			Pending: (subscribe) => subscribe(tryResolve),
			Resolved: tryResolve,
		});

		match(otherVow)({
			Pending: (subscribe) => subscribe(tryResolve),
			Resolved: tryResolve,
		});
	});
}

/**
 * Combines two Vows and transforms the result with a mapping function.
 *
 * This is equivalent to calling `zip` followed by `map`, but more convenient
 * when you want to combine and transform in one step.
 *
 * @template T The type of the first Vow's resolved value
 * @template U The type of the second Vow's resolved value
 * @template V The type of the transformed result
 * @param self The first Vow
 * @param otherVow The second Vow
 * @param mapping Function to combine both resolved values
 * @returns A Vow containing the combined and transformed value
 *
 * @example
 * ```ts
 * import { resolved, wait, zipWith } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const priceVow = resolved(100);
 * const quantityVow = resolved(3);
 *
 * const totalVow = zipWith(priceVow, quantityVow, (price, qty) => price * qty);
 * assertEquals(await wait(totalVow), 300);
 * ```
 */
export function zipWith<T, U, V>(
	self: Vow<T>,
	otherVow: Vow<U>,
	mapping: (first: T, second: U) => V,
): Vow<V> {
	return map(zip(self, otherVow), ([first, second]) => mapping(first, second));
}

/**
 * Joins any number of Vows into a single Vow of all their values, in order:
 * the n-ary {@linkcode zip}.
 *
 * The result resolves once every input has. When every input is already
 * resolved (or there are none), it resolves inside the call, so a join of
 * synchronous work stays synchronous.
 *
 * @template T The type of each Vow's resolved value
 * @param vows The Vows to join
 * @returns A Vow that resolves with every value, in the order of `vows`
 *
 * @example
 * ```ts
 * import { all, resolved, value, vowWithResolver, wait } from "@sekhmet/vow";
 * import { Some } from "@sekhmet/enum/option/mini";
 * import { assertEquals } from "@std/assert";
 *
 * // Every input already resolved: the join resolves inside the call
 * assertEquals(value(all([resolved(1), resolved(2)])), Some([1, 2]));
 *
 * const { vow: later, resolve } = vowWithResolver<number>();
 * const joined = all([resolved(1), later]);
 * resolve(3);
 *
 * assertEquals(await wait(joined), [1, 3]);
 * ```
 */
export function all<T>(vows: readonly Vow<T>[]): Vow<T[]> {
	return new Vow<T[]>((resolve) => {
		const values: T[] = [];
		let remaining = vows.length;

		const arrive = ({ index, value }: { index: number; value: T }): void => {
			values[index] = value;
			remaining -= 1;
			if (remaining === 0) resolve(values);
		};

		if (remaining === 0) resolve(values);
		vows.forEach((vow, index) => {
			match(vow)({
				Pending: (subscribe) => subscribe((value) => arrive({ index, value })),
				Resolved: (value) => arrive({ index, value }),
			});
		});
	});
}

/**
 * Converts a Vow into a Promise, bridging sync and async worlds.
 *
 * The returned Promise resolves when the Vow resolves. If the Vow
 * is already resolved, the Promise resolves on the next microtask.
 *
 * @template T The type of the resolved value
 * @param self The Vow to convert
 * @returns A Promise that resolves with the Vow's value
 *
 * @example
 * ```ts
 * import { resolved, wait } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * const vow = resolved(42);
 *
 * // Use await to get the value
 * assertEquals(await wait(vow), 42);
 *
 * // Or use Promise methods
 * await wait(vow).then((v) => assertEquals(v, 42));
 * ```
 */
export function wait<T>(self: Vow<T>): Promise<T> {
	return new Promise((resolve) => {
		match(self)({
			Pending: (subscribe) => subscribe(resolve),
			Resolved: resolve,
		});
	});
}
