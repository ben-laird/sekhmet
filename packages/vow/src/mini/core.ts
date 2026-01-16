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
 * ```ts ignore
 * // Create a vow that resolves immediately
 * const vow = new Vow<number>((resolve) => {
 *   resolve(42);
 * });
 *
 * // Chain transformations
 * const doubled = vow.andThen((n) => n * 2);
 *
 * // Create a deferred vow
 * const { vow: deferred, resolve } = vowWithResolver<string>();
 * deferred.andThen((s) => console.log("Resolved:", s));
 * resolve("hello"); // Logs: "Resolved: hello"
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
				Pending: (deps) => {
					getStructParams(this).variant = ["Resolved", value];

					resolveDependencies(value, deps);
				},
				Resolved: () => {},
			});
		});

		// ---
		// (1.2) If at this point the Vow is resolved, it was resolved
		// synchronously within the executor
	}

	/**
	 * Chains a transformation to run when the vow is resolved.
	 *
	 * If the vow is already resolved, the transformation runs immediately.
	 * If pending, the transformation is queued and runs when resolved.
	 *
	 * @template U The type of the transformed value
	 * @param onResolution Function to transform the resolved value
	 * @returns A new Vow that resolves with the transformed value
	 *
	 * @example
	 * ```ts ignore
	 * const vow = new Vow<number>((resolve) => resolve(5));
	 * const squared = vow.andThen((n) => n * n); // Resolves to 25
	 * ```
	 */
	andThen<U>(onResolution: (value: T) => U): Vow<U> {
		return new Vow<U>((resolve) => {
			match(this)({
				Pending(deps) {
					deps.push(resolveMap);
				},
				Resolved: resolveMap,
			});

			function resolveMap(value: T): void {
				resolve(onResolution(value));
			}
		});
	}
}

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
 * ```ts ignore
 * const { vow, resolve } = vowWithResolver<string>();
 *
 * // Set up what happens when resolved
 * vow.andThen((value) => {
 *   console.log("Got:", value);
 * });
 *
 * // Later, resolve it
 * resolve("hello world");
 * // Logs: "Got: hello world"
 * ```
 */
export function vowWithResolver<T>(): VowWithResolver<T> {
	let resolve!: Resolver<T>;

	const vow = new Vow<T>((res) => {
		resolve = res;
	});

	return { resolve, vow };
}

function resolveDependencies<T>(value: T, dependencies: Resolver<T>[]): void {
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
}
