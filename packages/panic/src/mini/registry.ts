/**
 * A registry that associates metadata with Panic instances, keyed by id.
 *
 * @module
 */

import type { Panic } from "./core.ts";

/** Boxed so a stored `undefined` stays distinguishable from a missing entry. */
interface Entry<M> {
	readonly meta: M;
}

interface PanicMetadataRegistryParams<M, P> {
	meta: (panic: P) => M;
	registry: Map<string, Entry<M>>;
}

/**
 * A registry for storing metadata associated with Panic instances.
 *
 * This is useful for tracking additional information about panics,
 * such as how they were handled, where they occurred, or any other
 * metadata that should be associated with specific panic instances.
 *
 * @template M The type of metadata stored for each panic
 * @template P The type of Panic (defaults to Panic<unknown>)
 *
 * @example
 * ```ts
 * import {
 *   definePanicRuntime,
 *   Panic,
 *   panic,
 *   PanicMetadataRegistry,
 * } from "@sekhmet/panic";
 * import { assertEquals } from "@std/assert";
 *
 * interface PanicMeta {
 *   handler: string;
 * }
 *
 * const registry = new PanicMetadataRegistry<PanicMeta>(() => ({
 *   handler: "main",
 * }));
 *
 * // Record every panic this runtime reports
 * const runtime = definePanicRuntime();
 * runtime.setHook(({ payload }) => {
 *   if (payload instanceof Panic) registry.getOrInsert(payload);
 * });
 *
 * runtime.catchUnwind(() => panic({ message: "bad state", cause: null }));
 *
 * assertEquals([...registry].map(([, meta]) => meta), [{ handler: "main" }]);
 * ```
 */
export class PanicMetadataRegistry<
	M,
	P extends Panic<unknown> = Panic<unknown>,
> {
	/**
	 * Creates a new registry with a metadata factory function.
	 *
	 * @param meta Function to create metadata for a panic
	 */
	constructor(meta: (panic: P) => M) {
		this.#params = { meta, registry: new Map() };
	}

	#params: PanicMetadataRegistryParams<M, P>;

	/**
	 * The number of panics registered.
	 */
	get size(): number {
		return this.#params.registry.size;
	}

	/**
	 * Gets the metadata for a panic if it exists.
	 *
	 * @param panic The panic to look up
	 * @returns The metadata, or undefined if not registered
	 */
	get(panic: P): M | undefined {
		return this.#params.registry.get(panic.id)?.meta;
	}

	/**
	 * Registers a panic and creates its metadata.
	 *
	 * @param panic The panic to register
	 * @returns This registry for chaining
	 */
	set(panic: P): this {
		const { registry, meta } = this.#params;

		registry.set(panic.id, { meta: meta(panic) });

		return this;
	}

	/**
	 * Gets the metadata for a panic, creating it if it doesn't exist.
	 *
	 * @param panic The panic to look up or register
	 * @returns The metadata for the panic
	 */
	getOrInsert(panic: P): M {
		const { registry, meta } = this.#params;
		const existing = registry.get(panic.id);
		if (existing) {
			return existing.meta;
		}

		const created = { meta: meta(panic) };
		registry.set(panic.id, created);

		return created.meta;
	}

	/**
	 * Removes a panic from the registry.
	 *
	 * @param panic The panic to remove
	 * @returns True if the panic was registered and removed
	 */
	delete(panic: P): boolean {
		return this.#params.registry.delete(panic.id);
	}

	/**
	 * Removes all panics from the registry.
	 */
	clear(): void {
		this.#params.registry.clear();
	}

	/**
	 * Checks if a panic is registered.
	 *
	 * @param panic The panic to check
	 * @returns True if the panic is registered
	 */
	has(panic: P): boolean {
		return this.#params.registry.has(panic.id);
	}

	/**
	 * Returns an iterator over the registry entries.
	 *
	 * @returns An iterator of [panicId, metadata] pairs
	 */
	*entries(): Generator<[string, M], void, undefined> {
		for (const [id, { meta }] of this.#params.registry) {
			yield [id, meta];
		}
	}

	/**
	 * Makes the registry iterable.
	 *
	 * @yields [panicId, metadata] pairs
	 */
	*[Symbol.iterator](): Generator<[string, M], void, undefined> {
		yield* this.entries();
	}
}
