/**
 * The `Panic` type and the `panic` functions that throw it. A panic means a
 * broken invariant; recover from one at a panic runtime's boundary.
 *
 * @module
 */

/**
 * Base interface for panic sources without a typed cause.
 */
export interface PanicSourceBase {
	/** Optional name for categorizing the panic */
	name?: string | undefined;
	/** The error message describing what went wrong */
	message: string;
}

/**
 * Interface for panic sources with a typed cause.
 *
 * @template T The type of the underlying cause
 */
export interface PanicSource<T> extends PanicSourceBase {
	/** The underlying cause of the panic */
	cause: T;
}

interface PanicParams<T> {
	name?: string | undefined;
	cause: T;
	timestamp: Date;
	id: string;
}

/**
 * Throws a Panic without a cause.
 *
 * @param source The panic source containing name and message
 * @returns Never - always throws
 *
 * @example
 * ```ts ignore
 * panicWithoutCause({ message: "Unexpected state reached" });
 * ```
 */
export function panicWithoutCause(source: PanicSourceBase): never {
	throw new Panic({ ...source, cause: null });
}

/**
 * Throws a Panic with a typed cause.
 *
 * @template T The type of the underlying cause
 * @param source The panic source containing name, message, and cause
 * @returns Never - always throws
 *
 * @example
 * ```ts ignore
 * panic({
 *   name: "ValidationError",
 *   message: "Invalid input provided",
 *   cause: { field: "email", reason: "invalid format" },
 * });
 * ```
 */
export function panic<T>(source: PanicSource<T>): never {
	throw new Panic(source);
}

/**
 * A structured error type for unrecoverable errors.
 *
 * Panic extends Error and provides additional metadata including a unique ID,
 * timestamp, and typed cause. Use Panic for errors that should not be caught
 * and recovered from in normal program flow.
 *
 * @template T The type of the underlying cause
 *
 * @example
 * ```ts ignore
 * try {
 *   throw new Panic({
 *     name: "DatabaseError",
 *     message: "Connection lost",
 *     cause: { host: "localhost", port: 5432 },
 *   });
 * } catch (err) {
 *   if (err instanceof Panic) {
 *     console.log(err.id); // UUID
 *     console.log(err.timestamp); // Date
 *     console.log(err.cause); // { host: "localhost", port: 5432 }
 *   }
 * }
 * ```
 */
export class Panic<T> extends Error {
	/**
	 * Creates a new Panic instance.
	 * @param source The panic source containing name, message, and cause
	 */
	constructor(source: PanicSource<T>) {
		super(source.message);

		this.#params = {
			name: source.name,
			id: crypto.randomUUID(),
			timestamp: new Date(),
			cause: source.cause,
		};
	}

	#params: PanicParams<T>;

	/**
	 * Unique identifier for this panic instance.
	 */
	get id(): string {
		return this.#params.id;
	}

	/**
	 * Timestamp when this panic was created.
	 */
	get timestamp(): Date {
		return this.#params.timestamp;
	}

	/**
	 * The underlying cause of this panic.
	 */
	override get cause(): T {
		return this.#params.cause;
	}

	/**
	 * The name of this panic, including any custom name.
	 */
	override get name(): string {
		const innerName = this.#params.name;

		return `Panic${innerName ? ` (${innerName})` : ""}`;
	}

	/**
	 * Type guard to check if the cause matches a predicate.
	 *
	 * @template S A narrowed type that T can be refined to
	 * @param predicate A type guard function for the cause
	 * @returns True if the predicate matches, narrowing the Panic type
	 *
	 * @example
	 * ```ts ignore
	 * const panic = new Panic({
	 *   message: "Error",
	 *   cause: { type: "network", code: 500 },
	 * });
	 *
	 * if (panic.check((c): c is { type: "network"; code: number } => c.type === "network")) {
	 *   console.log(panic.cause.code); // 500
	 * }
	 * ```
	 */
	check<S extends T>(predicate: (cause: T) => cause is S): this is Panic<S> {
		return predicate(this.cause);
	}
}
