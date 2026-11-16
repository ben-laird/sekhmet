/**
 * The boolean word lists shared by `stringbool` and `boolean`'s strict
 * coercion. Not part of the public API beyond the constants `stringbool`
 * re-exports.
 *
 * @module
 */

/** The words `stringbool` reads as `true` by default. */
export const STRINGBOOL_TRUTHY: readonly string[] = [
	"true",
	"1",
	"yes",
	"on",
	"y",
	"enabled",
];

/** The words `stringbool` reads as `false` by default. */
export const STRINGBOOL_FALSY: readonly string[] = [
	"false",
	"0",
	"no",
	"off",
	"n",
	"disabled",
];

/** The word lists read as each boolean. */
export interface Words {
	/** The words read as `true`. */
	readonly truthy?: readonly string[];
	/** The words read as `false`. */
	readonly falsy?: readonly string[];
}

/**
 * Reads a text as a boolean: `true` for a truthy word, `false` for a falsy
 * one, `undefined` for any other.
 */
export type ReadWord = (text: string) => boolean | undefined;

/** A word list's normal forms, trimmed and lower-cased. */
function normalWords(words: readonly string[]): ReadonlySet<string> {
	return new Set(words.map((word) => word.trim().toLowerCase()));
}

/**
 * Builds the reader for two word lists (the defaults when absent). The text
 * is trimmed and matched ignoring case. Panics with a `RangeError` when a
 * word is in both lists, since it could mean either boolean.
 */
export function wordReader(words: Words | undefined): ReadWord {
	const truthy = normalWords(words?.truthy ?? STRINGBOOL_TRUTHY);
	const falsy = normalWords(words?.falsy ?? STRINGBOOL_FALSY);
	const shared = [...truthy].filter((word) => falsy.has(word));
	if (shared.length > 0) {
		throw new RangeError(
			`stringbool words are both truthy and falsy: ${shared.join(", ")}`,
		);
	}

	return (text) => {
		const word = text.trim().toLowerCase();
		if (truthy.has(word)) return true;
		if (falsy.has(word)) return false;

		return undefined;
	};
}
