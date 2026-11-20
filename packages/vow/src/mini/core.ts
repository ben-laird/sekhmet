/**
 * The {@linkcode Vow} class and its {@linkcode Resolver} type.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { getStructParams } from "@sekhmet/primordials/struct";

/**
 * A resolver function that accepts a value to resolve a Vow.
 *
 * @template T The type of value being resolved
 */
export type Resolver<T> = (arg: T) => void;

/**
 * Registers a dependent on a pending Vow: the dependent runs once, with the
 * value, when the vow resolves.
 *
 * Calling it after the vow has resolved runs the dependent at once.
 *
 * @template T The type of value the vow resolves with
 */
export type Subscribe<T> = (dependent: (value: T) => void) => void;

/**
 * The variant types for a Vow.
 *
 * Represents the two possible states:
 * - `Pending`: Waiting for resolution, with a {@linkcode Subscribe} function
 *   that registers a dependent
 * - `Resolved`: Contains the resolved value
 *
 * `Pending` holds only a way to subscribe, never the dependents themselves,
 * so `T` appears only in output positions and a Vow is covariant in `T`.
 */
type Variants<T> = Split<{
	Pending: [subscribe: Subscribe<T>];
	Resolved: [value: T];
}>;

export type { Variants as VowVariants };

/**
 * Where a vow's resolution stands, inside its constructor's closure:
 * `Resolving` while its dependents are being drained.
 */
type Phase<T> =
	| { readonly kind: "Pending" }
	| { readonly kind: "Resolving" }
	| { readonly kind: "Settled"; readonly value: T };

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
export class Vow<out T> extends Enum<Variants<T>> {
	/**
	 * Creates a new Vow with an executor function.
	 *
	 * The executor receives a resolve function that can be called to resolve
	 * the vow. If resolve is called synchronously within the executor, the
	 * vow will be resolved immediately.
	 *
	 * Resolving runs every dependent once, in registration order. A
	 * dependent subscribed while the vow is resolving joins the end of that
	 * queue; one subscribed after resolution finishes runs at once. If any
	 * dependents throw, the rest still run, the vow is still resolved, and the
	 * errors are thrown to the caller of `resolve` as one `AggregateError`.
	 * Only the first call to `resolve` has any effect.
	 *
	 * @param executor Function that receives the resolve callback
	 */
	constructor(executor: (resolve: Resolver<T>) => void) {
		const dependents: ((value: T) => void)[] = [];
		let phase: Phase<T> = { kind: "Pending" };

		super("Pending", (dependent) => {
			if (phase.kind !== "Settled") {
				dependents.push(dependent);
				return;
			}

			dependent(phase.value);
		});

		executor((value) => {
			if (phase.kind !== "Pending") {
				return;
			}

			phase = { kind: "Resolving" };
			getStructParams(this).variant = ["Resolved", value];

			let aggregate: AggregateError | undefined;

			// The array iterator is live, so dependents subscribed meanwhile run too
			for (const dependent of dependents) {
				try {
					dependent(value);
				} catch (cause: unknown) {
					if (!aggregate) {
						aggregate = new AggregateError([]);
					}

					aggregate.errors.push(cause);
				}
			}

			dependents.length = 0;
			phase = { kind: "Settled", value };

			if (aggregate) {
				throw aggregate;
			}
		});
	}
}
