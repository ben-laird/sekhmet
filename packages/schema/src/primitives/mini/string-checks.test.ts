import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	InvalidFormat,
	InvalidType,
	type SchemaIssue,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	ParseError,
	parseSync,
} from "@/src/core/mini/schema.ts";
import { type StringSchemaOptions, string } from "./string.ts";
import type { LetterCase } from "./string-checks.ts";
import { EMAIL_PATTERN } from "./string-formats.ts";

const panics = definePanicRuntime();

Deno.test("minLength and maxLength bound a string's length inclusively", () => {
	// Given: a string of 2 to 4 characters
	const schema = string({ minLength: 2, maxLength: 4 });

	// When: parsing strings at, inside and beyond the bounds
	// Then: the bounds pass and the strings beyond fail with their issue
	assertEquals(parseSync(schema, { input: "ab", panics }), Ok("ab"));
	assertEquals(parseSync(schema, { input: "abcd", panics }), Ok("abcd"));
	assertEquals(
		parseSync(schema, { input: "a", panics }),
		Err(
			ParseError(
				TooSmall({ input: "a", origin: "string", minimum: 2, inclusive: true }),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "abcde", panics }),
		Err(
			ParseError(
				TooBig({
					input: "abcde",
					origin: "string",
					maximum: 4,
					inclusive: true,
				}),
			),
		),
	);
});

Deno.test("length counts UTF-16 code units", () => {
	// Given: a string of at most one character, and an astral emoji
	const schema = string({ maxLength: 1 });
	const emoji = "\u{1F600}";

	// When: parsing the emoji, which is two code units
	const result = parseSync(schema, { input: emoji, panics });

	// Then: it is too long
	assertEquals(
		result,
		Err(
			ParseError(
				TooBig({ input: emoji, origin: "string", maximum: 1, inclusive: true }),
			),
		),
	);
});

Deno.test("regex accepts matches and reports the pattern on a mismatch", () => {
	// Given: a slug pattern
	const pattern = /^[a-z0-9-]+$/;
	const schema = string({ regex: pattern });

	// When: parsing a slug and a non-slug
	// Then: the slug passes and the other fails with InvalidFormat
	assertEquals(parseSync(schema, { input: "a-slug", panics }), Ok("a-slug"));
	assertEquals(
		parseSync(schema, { input: "Not a slug", panics }),
		Err(
			ParseError(
				InvalidFormat({ input: "Not a slug", format: "regex", pattern }),
			),
		),
	);
});

Deno.test("regex ignores a global pattern's lastIndex", () => {
	// Given: a global pattern, which RegExp#test makes stateful
	const schema = string({ regex: /a/g });

	// When: parsing the same matching string repeatedly
	const results = [1, 2, 3].map(() =>
		parseSync(schema, { input: "a", panics }),
	);

	// Then: every parse passes
	assertEquals(results, [Ok("a"), Ok("a"), Ok("a")]);
});

Deno.test("startsWith and endsWith accept a string with the prefix and suffix", () => {
	// Given: a string that must start with "v" and end with ".json"
	const schema = string({ startsWith: "v", endsWith: ".json" });

	// When: parsing strings with both, and the bare affixes
	// Then: they pass unchanged
	assertEquals(parseSync(schema, { input: "v1.json", panics }), Ok("v1.json"));
	assertEquals(parseSync(schema, { input: "v.json", panics }), Ok("v.json"));
});

Deno.test("startsWith and endsWith report InvalidFormat naming the check", () => {
	// Given: a string that must start with "v" and end with ".json"
	const schema = string({ startsWith: "v", endsWith: ".json" });

	// When: parsing strings missing the prefix, the suffix, or both
	// Then: each fails naming the first affix it lacks, prefix first
	assertEquals(
		parseSync(schema, { input: "1.json", panics }),
		Err(ParseError(InvalidFormat({ input: "1.json", format: "starts-with" }))),
	);
	assertEquals(
		parseSync(schema, { input: "v1.yaml", panics }),
		Err(ParseError(InvalidFormat({ input: "v1.yaml", format: "ends-with" }))),
	);
	assertEquals(
		parseSync(schema, { input: "1.yaml", panics }),
		Err(ParseError(InvalidFormat({ input: "1.yaml", format: "starts-with" }))),
	);
});

Deno.test("startsWith and endsWith compare code units, case-sensitively", () => {
	// Given: a prefix in lower case, and an empty suffix
	const schema = string({ startsWith: "http", endsWith: "" });

	// When: parsing the prefix in upper case, and any string
	// Then: the case matters, and an empty affix always passes
	assertEquals(
		parseSync(schema, { input: "HTTP://x", panics }),
		Err(
			ParseError(InvalidFormat({ input: "HTTP://x", format: "starts-with" })),
		),
	);
	assertEquals(
		parseSync(schema, { input: "http://x", panics }),
		Ok("http://x"),
	);
});

Deno.test("startsWith and endsWith see the trimmed string", () => {
	// Given: a trimmed string with a prefix and a suffix
	const schema = string({ trim: true, startsWith: "<", endsWith: ">" });

	// When: parsing a padded tag
	const result = parseSync(schema, { input: "  <b>\n", panics });

	// Then: the affixes are checked after trimming
	assertEquals(result, Ok("<b>"));
});

Deno.test("trim removes surrounding whitespace before the checks", () => {
	// Given: a trimmed string of at least 1 character
	const schema = string({ trim: true, minLength: 1 });

	// When: parsing padded text and whitespace alone
	// Then: the text is trimmed, and the whitespace fails as empty
	assertEquals(parseSync(schema, { input: "\t hi \n", panics }), Ok("hi"));
	assertEquals(
		parseSync(schema, { input: "   ", panics }),
		Err(
			ParseError(
				TooSmall({ input: "", origin: "string", minimum: 1, inclusive: true }),
			),
		),
	);
});

Deno.test("normalize converts to the given Unicode form", () => {
	// Given: "é" composed (one code point) and decomposed (e + accent)
	const composed = "é";
	const decomposed = "é";
	const nfc = string({ normalize: "NFC" });

	// When: normalizing each to NFC, NFD and NFKC
	// Then: both become the same string in each form
	assertEquals(parseSync(nfc, { input: decomposed, panics }), Ok(composed));
	assertEquals(parseSync(nfc, { input: composed, panics }), Ok(composed));
	assertEquals(
		parseSync(string({ normalize: "NFD" }), { input: composed, panics }),
		Ok(decomposed),
	);
	assertEquals(
		parseSync(string({ normalize: "NFKC" }), { input: "ﬁ", panics }),
		Ok("fi"),
	);
});

Deno.test("trim runs before normalize, and both before the checks", () => {
	// Given: a trimmed, NFKC-normalized string of at most 2 characters
	const schema = string({ trim: true, normalize: "NFKC", maxLength: 2 });

	// When: parsing a padded ligature, which NFKC expands to two letters
	const result = parseSync(schema, { input: "  ﬁ ", panics });

	// Then: the output is trimmed and normalized, and fits the length
	assertEquals(result, Ok("fi"));
});

for (const { letterCase, input, expected } of [
	{ letterCase: "lower", input: "Ada LOVELACE", expected: "ada lovelace" },
	{ letterCase: "upper", input: "Ada lovelace", expected: "ADA LOVELACE" },
	{ letterCase: "lower", input: "ÉCOLE", expected: "école" },
	{ letterCase: "upper", input: "straße", expected: "STRASSE" },
	{ letterCase: "lower", input: "I", expected: "i" },
	{ letterCase: "upper", input: "123 -_", expected: "123 -_" },
] as const) {
	Deno.test(`case "${letterCase}" converts "${input}" to "${expected}"`, () => {
		// Given: a string converted to a letter case
		const schema = string({ case: letterCase });

		// When: parsing a string in mixed case
		const result = parseSync(schema, { input: input, panics });

		// Then: it is converted by Unicode's default (not the locale's) mapping
		assertEquals(result, Ok(expected));
	});
}

Deno.test("case runs after trim and normalize, and before the checks", () => {
	// Given: a trimmed, NFKC-normalized, upper-cased string with a prefix
	const schema = string({
		trim: true,
		normalize: "NFKC",
		case: "upper",
		startsWith: "FI",
		maxLength: 4,
	});

	// When: parsing a padded ligature word, and one without the prefix
	// Then: the ligature expands, then uppers, and the checks see the result
	assertEquals(parseSync(schema, { input: "  ﬁne ", panics }), Ok("FINE"));
	assertEquals(
		parseSync(schema, { input: "fun", panics }),
		Err(ParseError(InvalidFormat({ input: "FUN", format: "starts-with" }))),
	);
});

Deno.test("case can change a string's length before the length checks", () => {
	// Given: an upper-cased string of at most 5 code units
	const schema = string({ case: "upper", maxLength: 5 });

	// When: parsing a 5-letter word whose "ß" uppers to "SS"
	const result = parseSync(schema, { input: "straß", panics });

	// Then: the converted string is too long
	assertEquals(
		result,
		Err(
			ParseError(
				TooBig({
					input: "STRASS",
					origin: "string",
					maximum: 5,
					inclusive: true,
				}),
			),
		),
	);
});

Deno.test("coercion runs before the transforms and checks", () => {
	// Given: a coercing string of at least 3 characters
	const schema = string({ coerce: true, minLength: 3 });

	// When: parsing numbers that convert to long and short strings
	// Then: the check sees the converted string
	assertEquals(parseSync(schema, { input: 123, panics }), Ok("123"));
	assertEquals(
		parseSync(schema, { input: 12, panics }),
		Err(
			ParseError(
				TooSmall({
					input: "12",
					origin: "string",
					minimum: 3,
					inclusive: true,
				}),
			),
		),
	);
});

Deno.test("checks report the first failure: lengths, then format, then regex", () => {
	// Given: a string with a length, a format and a pattern
	const pattern = /^x/;
	const schema = string({ minLength: 5, format: "email", regex: pattern });

	// When: parsing strings failing several checks
	// Then: the earliest check in the order is reported
	assertEquals(
		parseSync(schema, { input: "a@b", panics }),
		Err(
			ParseError(
				TooSmall({
					input: "a@b",
					origin: "string",
					minimum: 5,
					inclusive: true,
				}),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "not an email", panics }),
		Err(
			ParseError(
				InvalidFormat({
					input: "not an email",
					format: "email",
					pattern: EMAIL_PATTERN,
				}),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "ada@example.com", panics }),
		Err(
			ParseError(
				InvalidFormat({ input: "ada@example.com", format: "regex", pattern }),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "xada@example.com", panics }),
		Ok("xada@example.com"),
	);
});

Deno.test("a non-string fails before any check or transform", () => {
	// Given: a checked and transformed string schema
	const schema = string({ minLength: 1, trim: true, regex: /x/ });

	// When: parsing a non-string
	const result = parseSync(schema, { input: 5, panics });

	// Then: the string schema's own issue is reported
	assertEquals(
		result,
		Err(ParseError(InvalidType({ input: 5, expected: "string" }))),
	);
});

Deno.test("string's options don't change its types", () => {
	// Given: a string schema with transforms and checks
	const schema = string({ trim: true, format: "uuid" });

	// When: reading its types
	// Then: it takes anything, gives a string and fails with a SchemaIssue
	assertType<IsExact<Input<typeof schema>, unknown>>(true);
	assertType<IsExact<Output<typeof schema>, string>>(true);
	assertType<IsExact<ErrorOf<typeof schema>, SchemaIssue>>(true);
});

Deno.test("case takes one of two letter cases", () => {
	// Given: the case option's type
	// When: reading it
	// Then: it is "lower" or "upper", and nothing else
	assertType<IsExact<LetterCase, "lower" | "upper">>(true);
	assertType<IsExact<StringSchemaOptions["case"], LetterCase | undefined>>(
		true,
	);

	// @ts-expect-error: title case is not a letter case
	const title: StringSchemaOptions = { case: "title" };
	assertEquals(title.case, "title");
});

Deno.test("checks report the first failure: lengths, then affixes, then format", () => {
	// Given: a string with a length, a prefix, a suffix and a format
	const schema = string({
		maxLength: 20,
		startsWith: "a",
		endsWith: ".com",
		format: "email",
	});

	// When: parsing strings failing several checks
	// Then: the earliest check in the order is reported
	assertEquals(
		parseSync(schema, { input: "b@example.org-and-more", panics }),
		Err(
			ParseError(
				TooBig({
					input: "b@example.org-and-more",
					origin: "string",
					maximum: 20,
					inclusive: true,
				}),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "b@example.org", panics }),
		Err(
			ParseError(
				InvalidFormat({ input: "b@example.org", format: "starts-with" }),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "a@example.org", panics }),
		Err(
			ParseError(
				InvalidFormat({ input: "a@example.org", format: "ends-with" }),
			),
		),
	);
	assertEquals(
		parseSync(schema, { input: "a@.com", panics }),
		Err(
			ParseError(
				InvalidFormat({
					input: "a@.com",
					format: "email",
					pattern: EMAIL_PATTERN,
				}),
			),
		),
	);
});
