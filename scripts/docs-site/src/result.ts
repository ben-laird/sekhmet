/**
 * The outcome of a fallible step: its value, or why it failed. A plain
 * discriminated union, so the library's public types document themselves
 * (see the doc-lint note on `@sekhmet/enum`'s `Result`, tracked in #11).
 *
 * @module
 */

/** A value of type `T`, or an error of type `E`. */
export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

/**
 * A successful result.
 *
 * @param value - The value
 * @returns The result holding it
 */
export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

/**
 * A failed result.
 *
 * @param error - Why it failed
 * @returns The result holding the error
 */
export function err<const E>(error: E): Result<never, E> {
	return { ok: false, error };
}
