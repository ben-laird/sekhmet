/**
 * The internal symbol used to coordinate subtle operations
 */
const subtle: unique symbol = Symbol("@sekhmet/subtle");

/**
 * A general creator function that takes any parameters and produces an output.
 *
 * Ideally, creator functions should be pure, so equivalent parameters should
 * produce equivalent output.
 */
export type Creator<T, U extends unknown[] = []> = (...params: U) => T;

/**
 * The parameters a piece of subtle functionality should pass to the Subtle
 * constructor.
 */
export interface SubtleParams<T, U extends unknown[] = []> {
	/**
	 * The function that creates the subtle functionality. This is called every
	 * time the subtle functionality is used.
	 */
	create: Creator<T, U>;
}

/**
 * A construct that encapsulates the logic behind creating a piece of subtle
 * or sensitive functionality, like a controller or underlying
 * implementation mechanism.
 */
export interface Subtle<T, U extends unknown[] = []> {
	[subtle]: Creator<T, U>;
}
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: hacky workaround for --isolatedDeclarations for now. See https://github.com/microsoft/TypeScript/issues/61892#issuecomment-2989433469
export class Subtle<T, U extends unknown[] = []> {
	constructor(params: SubtleParams<T, U>) {
		this.#params = params;
		this[subtle] = this.#params.create;
	}

	#params: SubtleParams<T, U>;
}

/**
 * Creates a piece of subtle functionality by accessing a Subtle object
 * @param self The object to access subtle functionality
 * @param params The parameters required by the creator function
 * @returns The created subtle functionality
 */
export function useSubtle<T, U extends unknown[]>(
	self: Subtle<T, U>,
	...params: U
): T {
	return self[subtle](...params);
}
