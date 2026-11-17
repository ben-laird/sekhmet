/**
 * The length, affix and pattern checks and the case transform behind
 * `string`'s options. Internal: the barrel re-exports only
 * {@linkcode NormalizationForm} and {@linkcode LetterCase}.
 *
 * @module
 */

import { InvalidFormat, TooBig, TooSmall } from "@/src/core/mini/issue.ts";
import type { Inspect } from "./check.ts";

/** A Unicode normalization form, as `String.prototype.normalize` takes. */
export type NormalizationForm = "NFC" | "NFD" | "NFKC" | "NFKD";

/**
 * A letter case to convert a string to: `"lower"` as
 * `String.prototype.toLowerCase` does, `"upper"` as `toUpperCase` does. The
 * conversion is Unicode's default, not the runtime locale's, so it is the
 * same everywhere (Turkish `"I"` lowers to `"i"`), and it can change the
 * length (`"ß"` uppers to `"SS"`).
 */
export type LetterCase = "lower" | "upper";

/** Converts `value` to `letterCase`. */
export function toCase({
	value,
	letterCase,
}: {
	value: string;
	letterCase: LetterCase;
}): string {
	if (letterCase === "lower") return value.toLowerCase();

	return value.toUpperCase();
}

/**
 * Fails a string shorter than `minimum` with `TooSmall`. Length is
 * `String.prototype.length`: UTF-16 code units, so an emoji outside the
 * Basic Multilingual Plane counts as 2.
 */
export function minLength(minimum: number): Inspect<string> {
	return (value) => {
		if (value.length >= minimum) return undefined;

		return TooSmall({
			input: value,
			origin: "string",
			minimum,
			inclusive: true,
		});
	};
}

/** Fails a string longer than `maximum` (in UTF-16 code units) with `TooBig`. */
export function maxLength(maximum: number): Inspect<string> {
	return (value) => {
		if (value.length <= maximum) return undefined;

		return TooBig({ input: value, origin: "string", maximum, inclusive: true });
	};
}

/**
 * Fails a string that doesn't start with `prefix` with `InvalidFormat`
 * (format `"starts-with"`). It compares UTF-16 code units, case-sensitively.
 */
export function startsWith(prefix: string): Inspect<string> {
	return (value) => {
		if (value.startsWith(prefix)) return undefined;

		return InvalidFormat({ input: value, format: "starts-with" });
	};
}

/**
 * Fails a string that doesn't end with `suffix` with `InvalidFormat` (format
 * `"ends-with"`). It compares UTF-16 code units, case-sensitively.
 */
export function endsWith(suffix: string): Inspect<string> {
	return (value) => {
		if (value.endsWith(suffix)) return undefined;

		return InvalidFormat({ input: value, format: "ends-with" });
	};
}

/**
 * Fails a string that doesn't match `pattern` with `InvalidFormat` (format
 * `"regex"`), carrying the pattern. The pattern's `g` and `y` flags are
 * ignored, so its `lastIndex` never makes a check stateful.
 */
export function regex(pattern: RegExp): Inspect<string> {
	const stateless = new RegExp(
		pattern.source,
		pattern.flags.replace(/[gy]/g, ""),
	);

	return (value) => {
		if (stateless.test(value)) return undefined;

		return InvalidFormat({ input: value, format: "regex", pattern });
	};
}
