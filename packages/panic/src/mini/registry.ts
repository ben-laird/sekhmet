import type { Panic } from "./core.ts";

interface PanicMetadataRegistryParams<M, P> {
	meta: (panic: P) => M;
	registry: Map<string, M>;
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
 * ```ts ignore
 * interface PanicMeta {
 *   handledAt: Date;
 *   handler: string;
 * }
 *
 * const registry = new PanicMetadataRegistry<PanicMeta>((panic) => ({
 *   handledAt: new Date(),
 *   handler: "errorBoundary",
 * }));
 *
 * try {
 *   // ... code that might panic
 * } catch (err) {
 *   if (err instanceof Panic) {
 *     const meta = registry.getOrInsert(err);
 *     console.log(`Handled at: ${meta.handledAt}`);
 *   }
 * }
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
		return this.#params.registry.get(panic.id);
	}

	/**
	 * Registers a panic and creates its metadata.
	 *
	 * @param panic The panic to register
	 * @returns This registry for chaining
	 */
	set(panic: P): this {
		const { registry, meta } = this.#params;

		registry.set(panic.id, meta(panic));

		return this;
	}

	/**
	 * Gets the metadata for a panic, creating it if it doesn't exist.
	 *
	 * @param panic The panic to look up or register
	 * @returns The metadata for the panic
	 */
	getOrInsert(panic: P): M {
		if (!this.has(panic)) {
			this.set(panic);
		}

		// We know we just inserted or have previously inserted this panic,
		// so the as-cast is safe to perform
		return this.get(panic) as M;
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
	entries(): MapIterator<[string, M]> {
		return this.#params.registry.entries();
	}

	/**
	 * Makes the registry iterable.
	 *
	 * @yields [panicId, metadata] pairs
	 */
	*[Symbol.iterator](): Generator<[string, M], void, undefined> {
		yield* this.#params.registry;
	}
}
