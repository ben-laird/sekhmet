import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import {
	InvalidFormat,
	InvalidType,
	TooBig,
	TooSmall,
} from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import { string } from "./string.ts";
import {
	maxLength,
	minLength,
	normalize,
	regex,
	trim,
} from "./string-checks.ts";

Deno.test("minLength and maxLength bound a string's length inclusively", () => {
	// Given: a string of 2 to 4 characters
	const schema = maxLength(minLength(string(), 2), 4);

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
	const schema = maxLength(string(), 1);
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
	const schema = regex(string(), pattern);

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
	const schema = regex(string(), /a/g);

	// When: parsing the same matching string repeatedly
	const results = [1, 2, 3].map(() => parseSync(schema, "a"));

	// Then: every parse passes
	assertEquals(results, [Ok("a"), Ok("a"), Ok("a")]);
});

Deno.test("trim removes surrounding whitespace before later checks", () => {
	// Given: a trimmed string of at least 1 character
	const schema = minLength(trim(string()), 1);

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

Deno.test("normalize converts to NFC by default, or to a given form", () => {
	// Given: "é" composed (one code point) and decomposed (e + accent)
	const composed = "é";
	const decomposed = "é";

	// When: normalizing each with the default and with NFD
	// Then: both become the same string in each form
	assertEquals(parseSync(normalize(string()), decomposed), Ok(composed));
	assertEquals(parseSync(normalize(string()), composed), Ok(composed));
	assertEquals(parseSync(normalize(string(), "NFD"), composed), Ok(decomposed));
	assertEquals(parseSync(normalize(string(), "NFKC"), "ﬁ"), Ok("fi"));
});

Deno.test("checks pass a failure of the schema they refine through", () => {
	// Given: a checked and transformed string schema
	const schema = regex(trim(minLength(string(), 1)), /x/);

	// When: parsing a non-string
	const result = parseSync(schema, 5);

	// Then: the string schema's own issue is reported
	assertEquals(
		result,
		Err(ParseError(InvalidType({ input: 5, expected: "string" }))),
	);
});
