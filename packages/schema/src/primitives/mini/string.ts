/**
 * The string primitive: {@linkcode string} builds a schema that accepts
 * strings, with the coercion, transforms and checks of its
 * {@linkcode StringSchemaOptions}.
 *
 * @module
 */

import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { leaf, when } from "./check.ts";
import type { CoerceMode } from "./coerce.ts";
import { coerceString } from "./convert.ts";
import {
	endsWith,
	type LetterCase,
	maxLength,
	minLength,
	type NormalizationForm,
	regex,
	startsWith,
	toCase,
} from "./string-checks.ts";
import {
	format,
	type StringFormat,
	type TimeFormat,
} from "./string-formats.ts";

/**
 * Options for configuring the string schema: coercion, the transforms
 * (`trim`, `normalize`, `case`) and the checks. Every option is off unless set.
 */
export interface StringSchemaOptions {
	/**
	 * How a non-string is treated (see {@linkcode CoerceMode}): rejected
	 * (`false`), strictly coerced (`true`: finite numbers, bigints and
	 * booleans), or converted with `String()` (`"native"`).
	 *
	 * @default false
	 */
	readonly coerce?: CoerceMode;

	/**
	 * Whether to remove leading and trailing whitespace (as
	 * `String.prototype.trim` does) before the checks. It never fails.
	 *
	 * @default false
	 */
	readonly trim?: boolean;

	/**
	 * The Unicode normalization form to convert the string to before the
	 * checks, so canonically equivalent strings compare equal: `"é"` written
	 * as one code point or as `e` plus a combining accent becomes the same
	 * string. It never fails.
	 */
	readonly normalize?: NormalizationForm;

	/**
	 * The letter case to convert the string to, after `normalize` and before
	 * the checks (see {@linkcode LetterCase}). It never fails, and the checks
	 * see the converted string, so write a `startsWith` in that case.
	 */
	readonly case?: LetterCase;

	/**
	 * The fewest characters allowed, failing with `TooSmall`. Length is
	 * `String.prototype.length`: UTF-16 code units, so an emoji outside the
	 * Basic Multilingual Plane counts as 2.
	 */
	readonly minLength?: number;

	/**
	 * The most characters allowed (UTF-16 code units, as `minLength` counts
	 * them), failing with `TooBig`.
	 */
	readonly maxLength?: number;

	/**
	 * A prefix the string must start with, failing with an `InvalidFormat`
	 * issue of format `"starts-with"`. It compares UTF-16 code units,
	 * case-sensitively, after the transforms.
	 */
	readonly startsWith?: string;

	/**
	 * A suffix the string must end with, failing with an `InvalidFormat` issue
	 * of format `"ends-with"`. It compares like `startsWith`.
	 */
	readonly endsWith?: string;

	/**
	 * A named format the string must be in (see {@linkcode StringFormat}),
	 * failing with an `InvalidFormat` issue naming it. A time format takes
	 * its options as a {@linkcode TimeFormat}:
	 * `format: { name: "date-time", precision: 3, offset: "allowed" }`.
	 */
	readonly format?: StringFormat | TimeFormat;

	/**
	 * A pattern the string must match, failing with an `InvalidFormat` issue
	 * (format `"regex"`) that carries the pattern. Its `g` and `y` flags are
	 * ignored, so its `lastIndex` never makes a check stateful.
	 */
	readonly regex?: RegExp;
}

/**
 * Creates a schema that validates, transforms and optionally coerces string
 * values.
 *
 * By default it accepts only strings, failing with an `InvalidType` issue
 * otherwise. `coerce: true` also accepts finite numbers, bigints and
 * booleans, as their `String()` form; `null`, `undefined`, `NaN`, objects
 * and symbols still fail. `coerce: "native"` converts anything `String()`
 * can.
 *
 * The options apply in this order: `coerce`, then the transforms `trim`,
 * `normalize` and `case`, then the checks `minLength`, `maxLength`,
 * `startsWith`, `endsWith`, `format` and `regex`, on the transformed string.
 * The first check that fails is reported.
 *
 * @param options Coercion, transforms and checks
 * @returns A schema that validates string inputs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * assertEquals(unwrap(parseSync(string(), { input: "hello", panics })), "hello");
 * assertEquals(isErr(parseSync(string(), { input: 123, panics })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const email = string({ trim: true, minLength: 3, format: "email" });
 * const slug = string({ regex: /^[a-z0-9-]+$/ });
 * const config = string({ startsWith: "config/", endsWith: ".json" });
 *
 * assertEquals(unwrap(parseSync(email, { input: " ada@example.com ", panics })), "ada@example.com");
 * assertEquals(isErr(parseSync(email, { input: "ada@localhost", panics })), true);
 * assertEquals(isErr(parseSync(slug, { input: "Not a slug", panics })), true);
 * assertEquals(isErr(parseSync(config, { input: "config/app.yaml", panics })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const handle = string({ trim: true, case: "lower", startsWith: "@" });
 *
 * assertEquals(unwrap(parseSync(handle, { input: " @Ada ", panics })), "@ada");
 * assertEquals(isErr(parseSync(handle, { input: "Ada", panics })), true);
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, unwrap } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const strict = string({ coerce: true });
 * assertEquals(unwrap(parseSync(strict, { input: 123, panics })), "123");
 * assertEquals(isErr(parseSync(strict, { input: null, panics })), true);
 *
 * const native = string({ coerce: "native" });
 * assertEquals(unwrap(parseSync(native, { input: null, panics })), "null");
 * ```
 */
export function string(
	options?: StringSchemaOptions,
): Schema<unknown, string, SchemaIssue> {
	const mode = options?.coerce ?? false;
	const form = options?.normalize;
	const letterCase = options?.case;
	const transform = (value: string): string => {
		const trimmed = options?.trim === true ? value.trim() : value;
		const normalized = form === undefined ? trimmed : trimmed.normalize(form);
		if (letterCase === undefined) return normalized;

		return toCase({ value: normalized, letterCase });
	};

	return leaf({
		details: { type: "string", options: options ?? {} },
		read: (input) => {
			const value = coerceString({ input, mode });

			if (value === undefined) {
				return Err(InvalidType({ input, expected: "string" }));
			}

			return Ok(transform(value));
		},
		inspections: [
			...when({ option: options?.minLength, inspect: minLength }),
			...when({ option: options?.maxLength, inspect: maxLength }),
			...when({ option: options?.startsWith, inspect: startsWith }),
			...when({ option: options?.endsWith, inspect: endsWith }),
			...when({ option: options?.format, inspect: format }),
			...when({ option: options?.regex, inspect: regex }),
		],
	});
}
