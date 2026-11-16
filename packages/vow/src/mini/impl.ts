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
 * ```ts ignore
 * const vow = resolved(42);
 *
 * // The vow is already resolved, so this runs immediately
 * map(vow, (n) => console.log("Value:", n));
 * // Logs: "Value: 42"
 * ```
 */
export function resolved<T>(value: T): Vow<T> {
	return new Vow((resolve) => resolve(value));
}

/**
 * Creates a Vow from a Promise, bridging async and sync worlds.
 *
 * The returned Vow will remain in the Pending state until the Promise
 * resolves, at which point the Vow will be resolved with the same value.
 *
 * @template T The type of the resolved value
 * @param promise The Promise to convert into a Vow
 * @returns A Vow that resolves when the Promise resolves
 *
 * @example
 * ```ts ignore
 * const promise = fetch("/api/data").then((r) => r.json());
 * const vow = fromPromise(promise);
 *
 * map(vow, (data) => {
 *   console.log("Received:", data);
 * });
 * ```
 */
export function fromPromise<T>(promise: Promise<T>): Vow<T> {
	return new Vow<T>((resolve) => {
		promise.then(resolve);
	});
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
 * ```ts ignore
 * const numberVow = resolved(5);
 * const stringVow = map(numberVow, (n) => `Value is ${n}`);
 *
 * // stringVow resolves to "Value is 5"
 * ```
 */
export function map<T, U>(self: Vow<T>, mapping: (value: T) => U): Vow<U> {
	return new Vow<U>((resolve) => {
		match(self)({
			Pending: (deps) => {
				deps.push(resolveMap);
			},
			Resolved: resolveMap,
		});

		function resolveMap(value: T): void {
			resolve(mapping(value));
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
 * ```ts ignore
 * const nameVow = resolved("Alice");
 * const ageVow = resolved(30);
 *
 * const combined = zip(nameVow, ageVow);
 * // combined resolves to ["Alice", 30]
 *
 * map(combined, ([name, age]) => {
 *   console.log(`${name} is ${age} years old`);
 * });
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
			Pending: (deps) => {
				deps.push(tryResolve);
			},
			Resolved: tryResolve,
		});

		match(otherVow)({
			Pending: (deps) => {
				deps.push(tryResolve);
			},
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
 * ```ts ignore
 * const priceVow = resolved(100);
 * const quantityVow = resolved(3);
 *
 * const totalVow = zipWith(priceVow, quantityVow, (price, qty) => price * qty);
 * // totalVow resolves to 300
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
 * ```ts ignore
 * const vow = resolved(42);
 *
 * // Use await to get the value
 * const value = await wait(vow);
 * console.log(value); // 42
 *
 * // Or use Promise methods
 * wait(vow).then((v) => console.log(v));
 * ```
 */
export function wait<T>(self: Vow<T>): Promise<T> {
	return new Promise((resolve) => {
		match(self)({
			Pending: (deps) => {
				deps.push(resolve);
			},
			Resolved: resolve,
		});
	});
}
