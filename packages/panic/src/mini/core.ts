/**
 * The `Panic` type and the `panic` functions that throw it. A panic means a
 * broken invariant; recover from one at a panic runtime's boundary.
 *
 * @module
 */

import { randomUuid } from "./uuid.ts";

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
 * ```ts
 * import { Panic, panicWithoutCause } from "@sekhmet/panic/mini/core";
 * import { assertThrows } from "@std/assert";
 *
 * const thrown = assertThrows(
 *   () => panicWithoutCause({ message: "Unexpected state reached" }),
 *   Panic,
 * );
 * thrown.cause; // null
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
 * ```ts
 * import { Panic, panic } from "@sekhmet/panic/mini/core";
 * import { assertEquals, assertThrows } from "@std/assert";
 *
 * const thrown = assertThrows(
 *   () =>
 *     panic({
 *       name: "ValidationError",
 *       message: "Invalid input provided",
 *       cause: { field: "email", reason: "invalid format" },
 *     }),
 *   Panic,
 * );
 * assertEquals(thrown.name, "Panic (ValidationError)");
 * ```
 */
export function panic<T>(source: PanicSource<T>): never {
	throw new Panic(source);
}

/**
 * A structured error type for unrecoverable errors.
 *
 * Panic extends Error and provides additional metadata including a unique ID,
 * timestamp, and typed cause. Use Panic for broken invariants, not expected
 * failures (return a `Result` for those). Recover from one only at a panic
 * runtime's boundary.
 *
 * @template T The type of the underlying cause
 *
 * @example
 * ```ts
 * import { definePanicRuntime, Panic } from "@sekhmet/panic";
 * import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
 * import { assert, assertEquals } from "@std/assert";
 *
 * const runtime = definePanicRuntime();
 * runtime.setHook(() => {}); // keep the example quiet
 *
 * const payload = unwrapErr(
 *   runtime.catchUnwind(() => {
 *     throw new Panic({
 *       name: "DatabaseError",
 *       message: "Connection lost",
 *       cause: { host: "localhost", port: 5432 },
 *     });
 *   }),
 * );
 *
 * assert(payload instanceof Panic);
 * assertEquals(payload.cause, { host: "localhost", port: 5432 });
 * payload.id; // a v4 UUID
 * payload.timestamp; // when it was constructed
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
			id: randomUuid(),
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
	 * ```ts
	 * import { Panic } from "@sekhmet/panic/mini/core";
	 * import { assert, assertEquals } from "@std/assert";
	 *
	 * type Cause = { type: "network"; code: number } | { type: "disk" };
	 * const isNetwork = (c: Cause): c is { type: "network"; code: number } =>
	 *   c.type === "network";
	 *
	 * const subject = new Panic<Cause>({
	 *   message: "Error",
	 *   cause: { type: "network", code: 500 },
	 * });
	 *
	 * assert(subject.check(isNetwork));
	 * assertEquals(subject.cause.code, 500);
	 * ```
	 */
	check<S extends T>(predicate: (cause: T) => cause is S): this is Panic<S> {
		return predicate(this.cause);
	}
}
