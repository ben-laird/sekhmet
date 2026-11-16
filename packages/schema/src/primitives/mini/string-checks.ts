import {
	InvalidFormat,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { map, type Schema } from "@/src/core/mini/schema.ts";
import { check } from "./check.ts";

/**
 * Checks that a string has at least `minimum` characters, failing with a
 * `TooSmall` issue. Length is `String.prototype.length`: UTF-16 code units,
 * so an emoji outside the Basic Multilingual Plane counts as 2.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @param minimum The fewest characters allowed
 * @returns A schema that also rejects shorter strings
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { minLength, string } from "@sekhmet/schema/primitives/mini";
 *
 * const name = minLength(string(), 2);
 *
 * assertEquals(isOk(parseSync(name, "Al")), true);
 * assertEquals(isErr(parseSync(name, "A")), true);
 * ```
 */
export function minLength<I, E>(
	self: Schema<I, string, E>,
	minimum: number,
): Schema<I, string, E | SchemaIssue> {
	return check(self, (value) =>
		value.length >= minimum
			? undefined
			: TooSmall({ input: value, origin: "string", minimum, inclusive: true }),
	);
}

/**
 * Checks that a string has at most `maximum` characters (UTF-16 code units,
 * as {@linkcode minLength} counts them), failing with a `TooBig` issue.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @param maximum The most characters allowed
 * @returns A schema that also rejects longer strings
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { maxLength, string } from "@sekhmet/schema/primitives/mini";
 *
 * const code = maxLength(string(), 3);
 *
 * assertEquals(isOk(parseSync(code, "abc")), true);
 * assertEquals(isErr(parseSync(code, "abcd")), true);
 * ```
 */
export function maxLength<I, E>(
	self: Schema<I, string, E>,
	maximum: number,
): Schema<I, string, E | SchemaIssue> {
	return check(self, (value) =>
		value.length <= maximum
			? undefined
			: TooBig({ input: value, origin: "string", maximum, inclusive: true }),
	);
}

/**
 * Checks that a string matches `pattern`, failing with an `InvalidFormat`
 * issue (format `"regex"`) that carries the pattern. The pattern's `g` and
 * `y` flags are ignored, so its `lastIndex` never makes a check stateful.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @param pattern The pattern the string must match
 * @returns A schema that also rejects non-matching strings
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { regex, string } from "@sekhmet/schema/primitives/mini";
 *
 * const slug = regex(string(), /^[a-z0-9-]+$/);
 *
 * assertEquals(isOk(parseSync(slug, "hello-world")), true);
 * assertEquals(isErr(parseSync(slug, "Hello World")), true);
 * ```
 */
export function regex<I, E>(
	self: Schema<I, string, E>,
	pattern: RegExp,
): Schema<I, string, E | SchemaIssue> {
	const stateless = new RegExp(
		pattern.source,
		pattern.flags.replace(/[gy]/g, ""),
	);

	return check(self, (value) =>
		stateless.test(value)
			? undefined
			: InvalidFormat({ input: value, format: "regex", pattern }),
	);
}

/**
 * Transforms a string by removing leading and trailing whitespace (as
 * `String.prototype.trim` does). It never fails; chain checks after it to
 * validate the trimmed value.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to transform
 * @returns A schema whose output is trimmed
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string, trim } from "@sekhmet/schema/primitives/mini";
 *
 * assertEquals(unwrap(parseSync(trim(string()), "  hi \n")), "hi");
 * ```
 */
export function trim<I, E>(self: Schema<I, string, E>): Schema<I, string, E> {
	return map(self, (value) => value.trim());
}

/** A Unicode normalization form, as `String.prototype.normalize` takes. */
export type NormalizationForm = "NFC" | "NFD" | "NFKC" | "NFKD";

/**
 * Transforms a string to a Unicode normalization form (`NFC` by default), so
 * that canonically equivalent strings compare equal: `"é"` written as one
 * code point or as `e` plus a combining accent becomes the same string. It
 * never fails.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to transform
 * @param form The normalization form; `"NFC"` when omitted
 * @returns A schema whose output is normalized
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { normalize, string } from "@sekhmet/schema/primitives/mini";
 *
 * const decomposed = "é";
 *
 * assertEquals(unwrap(parseSync(normalize(string()), decomposed)), "é");
 * ```
 */
export function normalize<I, E>(
	self: Schema<I, string, E>,
	form?: NormalizationForm,
): Schema<I, string, E> {
	const target = form ?? "NFC";

	return map(self, (value) => value.normalize(target));
}
