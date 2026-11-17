/**
 * The length and pattern checks behind `string`'s options. Internal: the
 * barrel re-exports only {@linkcode NormalizationForm}.
 *
 * @module
 */

import { InvalidFormat, TooBig, TooSmall } from "@/src/core/mini/issue.ts";
import type { Inspect } from "./check.ts";

/** A Unicode normalization form, as `String.prototype.normalize` takes. */
export type NormalizationForm = "NFC" | "NFD" | "NFKC" | "NFKD";

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
