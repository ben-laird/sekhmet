/**
 * {@linkcode Struct}: a base class that keeps its data behind a symbol, read
 * with {@linkcode getStructParams}. Sekhmet's enums, effects and fibers are
 * built on it.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { getStructParams, Struct } from "@sekhmet/primordials/struct";
 *
 * class Point extends Struct<{ x: number; y: number }> {}
 *
 * const point = new Point({ x: 1, y: 2 });
 * assertEquals(getStructParams(point).x, 1);
 * ```
 *
 * @module
 */

/**
 * The internal symbol used to coordinate between a {@linkcode Struct} and the {@linkcode getStructParams} function
 */
export const struct: unique symbol = Symbol("@sekhmet/struct");

/**
 * A construct that allows semi-private access to a variable. Useful for
 * mimicking Rust's structs and for facilitating common access patterns used
 * throughout Sekhmet.
 */
export interface Struct<T> {
	/**
	 * The internal field that stores the encapsulated value.
	 * Access via {@linkcode getStructParams} instead of directly.
	 */
	[struct]: T;
}
/**
 * A construct that allows semi-private access to a variable. Useful for
 * mimicking Rust's structs and for facilitating common access patterns used
 * throughout Sekhmet.
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: hacky workaround for --isolatedDeclarations for now. See https://github.com/microsoft/TypeScript/issues/61892#issuecomment-2989433469
export class Struct<T> {
	/**
	 * Creates a new Struct wrapping the given parameters.
	 * @param params The value to encapsulate within this Struct
	 */
	constructor(params: T) {
		this[struct] = params;
	}
}

/**
 * Provides access to the variable encapsulated by the given {@linkcode Struct}
 * @param self The struct to extract from
 * @returns The extracted variable
 */
export function getStructParams<T>(self: Struct<T>): T {
	return self[struct];
}
