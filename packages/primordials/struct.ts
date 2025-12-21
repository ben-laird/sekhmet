/**
 * The internal symbol used to coordinate between a {@linkcode Struct} and the {@linkcode getStructParams} function
 */
const struct: unique symbol = Symbol("@sekhmet/struct");

/**
 * A construct that allows semi-private access to a variable. Useful for
 * mimicking Rust's structs and for facilitating common access patterns used
 * throughout Sekhmet.
 */
export interface Struct<T> {
	[struct]: T;
}
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: hacky workaround for --isolatedDeclarations for now. See https://github.com/microsoft/TypeScript/issues/61892#issuecomment-2989433469
export class Struct<T> {
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
