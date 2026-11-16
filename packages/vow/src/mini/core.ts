/**
 * The {@linkcode Vow} class and its {@linkcode Resolver} type.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import { getStructParams } from "@sekhmet/primordials/struct";

/**
 * A resolver function that accepts a value to resolve a Vow.
 *
 * @template T The type of value being resolved
 */
export type Resolver<T> = (arg: T) => void;

/**
 * The variant types for a Vow.
 *
 * Represents the two possible states:
 * - `Pending`: Waiting for resolution, with a list of dependent resolvers
 * - `Resolved`: Contains the resolved value
 */
type Variants<T> = Split<{
	Pending: [deps: Resolver<T>[]];
	Resolved: [value: T];
}>;

export type { Variants as VowVariants };

/**
 * A synchronous promise-like abstraction built on the Enum framework.
 *
 * Vow is similar to Promise but operates synchronously. When resolved,
 * it immediately notifies all dependents. This is useful for building
 * synchronous data flow patterns where you want promise-like semantics
 * without async/await.
 *
 * @template T The type of the resolved value
 *
 * @example
 * ```ts
 * import { map, Vow, vowWithResolver, wait } from "@sekhmet/vow";
 * import { assertEquals } from "@std/assert";
 *
 * // Create a vow that resolves immediately
 * const vow = new Vow<number>((resolve) => {
 *   resolve(42);
 * });
 *
 * // Chain transformations
 * const doubled = map(vow, (n) => n * 2);
 * assertEquals(await wait(doubled), 84);
 *
 * // Create a deferred vow
 * const { vow: deferred, resolve } = vowWithResolver<string>();
 * const greeting = map(deferred, (s) => `Resolved: ${s}`);
 * resolve("hello");
 * assertEquals(await wait(greeting), "Resolved: hello");
 * ```
 */
export class Vow<T> extends Enum<Variants<T>> {
	/**
	 * Creates a new Vow with an executor function.
	 *
	 * The executor receives a resolve function that can be called to resolve
	 * the vow. If resolve is called synchronously within the executor, the
	 * vow will be resolved immediately.
	 *
	 * @param executor Function that receives the resolve callback
	 */
	constructor(executor: (resolve: Resolver<T>) => void) {
		super("Pending", []);

		executor((value) => {
			// (1.1) We can track whether this runs within the executor or not
			// by tracking when the executor finishes

			match(this)({
				Pending: (dependencies) => {
					getStructParams(this).variant = ["Resolved", value];

					let aggregate: AggregateError | undefined;

					for (const resolve of dependencies) {
						try {
							resolve(value);
						} catch (cause: unknown) {
							if (!aggregate) {
								aggregate = new AggregateError([]);
							}

							aggregate.errors.push(cause);
						}
					}

					if (aggregate) {
						throw aggregate;
					}
				},
				Resolved: () => {},
			});
		});

		// ---
		// (1.2) If at this point the Vow is resolved, it was resolved
		// synchronously within the executor
	}
}
