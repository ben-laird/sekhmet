/**
 * A fallible computation's outcome: the value on success, the error on failure.
 */
export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

/**
 * Wraps a success value.
 *
 * @param value - The value produced
 * @returns A successful result
 */
export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

/**
 * Wraps a failure.
 *
 * @param error - The failure produced
 * @returns A failed result
 */
export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}
