import { Err, Ok } from "@sekhmet/enum/result/mini";
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
import { string } from "./string.ts";
import { EMAIL_PATTERN } from "./string-formats.ts";

Deno.test("minLength and maxLength bound a string's length inclusively", () => {
	// Given: a string of 2 to 4 characters
	const schema = string({ minLength: 2, maxLength: 4 });

	// When: parsing strings at, inside and beyond the bounds
	// Then: the bounds pass and the strings beyond fail with their issue
	assertEquals(parseSync(schema, "ab"), Ok("ab"));
	assertEquals(parseSync(schema, "abcd"), Ok("abcd"));
	assertEquals(
		parseSync(schema, "a"),
		Err(
			ParseError(
				TooSmall({ input: "a", origin: "string", minimum: 2, inclusive: true }),
			),
		),
	);
	assertEquals(
		parseSync(schema, "abcde"),
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
	const result = parseSync(schema, emoji);

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
	assertEquals(parseSync(schema, "a-slug"), Ok("a-slug"));
	assertEquals(
		parseSync(schema, "Not a slug"),
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
	const results = [1, 2, 3].map(() => parseSync(schema, "a"));

	// Then: every parse passes
	assertEquals(results, [Ok("a"), Ok("a"), Ok("a")]);
});

Deno.test("startsWith and endsWith accept a string with the prefix and suffix", () => {
	// Given: a string that must start with "v" and end with ".json"
	const schema = string({ startsWith: "v", endsWith: ".json" });

	// When: parsing strings with both, and the bare affixes
	// Then: they pass unchanged
	assertEquals(parseSync(schema, "v1.json"), Ok("v1.json"));
	assertEquals(parseSync(schema, "v.json"), Ok("v.json"));
});

Deno.test("startsWith and endsWith report InvalidFormat naming the check", () => {
	// Given: a string that must start with "v" and end with ".json"
	const schema = string({ startsWith: "v", endsWith: ".json" });

	// When: parsing strings missing the prefix, the suffix, or both
	// Then: each fails naming the first affix it lacks, prefix first
	assertEquals(
		parseSync(schema, "1.json"),
		Err(ParseError(InvalidFormat({ input: "1.json", format: "starts-with" }))),
	);
	assertEquals(
		parseSync(schema, "v1.yaml"),
		Err(ParseError(InvalidFormat({ input: "v1.yaml", format: "ends-with" }))),
	);
	assertEquals(
		parseSync(schema, "1.yaml"),
		Err(ParseError(InvalidFormat({ input: "1.yaml", format: "starts-with" }))),
	);
});

Deno.test("startsWith and endsWith compare code units, case-sensitively", () => {
	// Given: a prefix in lower case, and an empty suffix
	const schema = string({ startsWith: "http", endsWith: "" });

	// When: parsing the prefix in upper case, and any string
	// Then: the case matters, and an empty affix always passes
	assertEquals(
		parseSync(schema, "HTTP://x"),
		Err(
			ParseError(InvalidFormat({ input: "HTTP://x", format: "starts-with" })),
		),
	);
	assertEquals(parseSync(schema, "http://x"), Ok("http://x"));
});

Deno.test("startsWith and endsWith see the trimmed string", () => {
	// Given: a trimmed string with a prefix and a suffix
	const schema = string({ trim: true, startsWith: "<", endsWith: ">" });

	// When: parsing a padded tag
	const result = parseSync(schema, "  <b>\n");

	// Then: the affixes are checked after trimming
	assertEquals(result, Ok("<b>"));
});

Deno.test("trim removes surrounding whitespace before the checks", () => {
	// Given: a trimmed string of at least 1 character
	const schema = string({ trim: true, minLength: 1 });

	// When: parsing padded text and whitespace alone
	// Then: the text is trimmed, and the whitespace fails as empty
	assertEquals(parseSync(schema, "\t hi \n"), Ok("hi"));
	assertEquals(
		parseSync(schema, "   "),
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
	assertEquals(parseSync(nfc, decomposed), Ok(composed));
	assertEquals(parseSync(nfc, composed), Ok(composed));
	assertEquals(
		parseSync(string({ normalize: "NFD" }), composed),
		Ok(decomposed),
	);
	assertEquals(parseSync(string({ normalize: "NFKC" }), "ﬁ"), Ok("fi"));
});

Deno.test("trim runs before normalize, and both before the checks", () => {
	// Given: a trimmed, NFKC-normalized string of at most 2 characters
	const schema = string({ trim: true, normalize: "NFKC", maxLength: 2 });

	// When: parsing a padded ligature, which NFKC expands to two letters
	const result = parseSync(schema, "  ﬁ ");

	// Then: the output is trimmed and normalized, and fits the length
	assertEquals(result, Ok("fi"));
});

Deno.test("coercion runs before the transforms and checks", () => {
	// Given: a coercing string of at least 3 characters
	const schema = string({ coerce: true, minLength: 3 });

	// When: parsing numbers that convert to long and short strings
	// Then: the check sees the converted string
	assertEquals(parseSync(schema, 123), Ok("123"));
	assertEquals(
		parseSync(schema, 12),
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
		parseSync(schema, "a@b"),
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
		parseSync(schema, "not an email"),
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
		parseSync(schema, "ada@example.com"),
		Err(
			ParseError(
				InvalidFormat({ input: "ada@example.com", format: "regex", pattern }),
			),
		),
	);
	assertEquals(parseSync(schema, "xada@example.com"), Ok("xada@example.com"));
});

Deno.test("a non-string fails before any check or transform", () => {
	// Given: a checked and transformed string schema
	const schema = string({ minLength: 1, trim: true, regex: /x/ });

	// When: parsing a non-string
	const result = parseSync(schema, 5);

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
		parseSync(schema, "b@example.org-and-more"),
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
		parseSync(schema, "b@example.org"),
		Err(
			ParseError(
				InvalidFormat({ input: "b@example.org", format: "starts-with" }),
			),
		),
	);
	assertEquals(
		parseSync(schema, "a@example.org"),
		Err(
			ParseError(
				InvalidFormat({ input: "a@example.org", format: "ends-with" }),
			),
		),
	);
	assertEquals(
		parseSync(schema, "a@.com"),
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
