import { Err, Ok } from "@sekhmet/enum/result/mini";
import { assertEquals, assertThrows } from "@std/assert";
import { InvalidType, InvalidValue } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync } from "@/src/core/mini/schema.ts";
import {
	STRINGBOOL_FALSY,
	STRINGBOOL_TRUTHY,
	stringbool,
} from "./stringbool.ts";

const DEFAULT_WORDS = [...STRINGBOOL_TRUTHY, ...STRINGBOOL_FALSY];

Deno.test("stringbool's default words are the design's lists", () => {
	// Given: the default word lists
	// When: reading them
	// Then: they are exactly the documented words
	assertEquals(STRINGBOOL_TRUTHY, ["true", "1", "yes", "on", "y", "enabled"]);
	assertEquals(STRINGBOOL_FALSY, ["false", "0", "no", "off", "n", "disabled"]);
});

Deno.test("stringbool reads every default word, trimmed and ignoring case", () => {
	const cases: [words: readonly string[], value: boolean][] = [
		[STRINGBOOL_TRUTHY, true],
		[STRINGBOOL_FALSY, false],
	];
	for (const [words, value] of cases) {
		for (const word of words) {
			for (const input of [word, word.toUpperCase(), `  ${word}\t`]) {
				// Given: a default stringbool schema
				const schema = stringbool();

				// When: parsing a default word, in any case, with whitespace
				const result = parseSync(schema, input);

				// Then: it reads as the word's boolean
				assertEquals(result, Ok(value), JSON.stringify(input));
			}
		}
	}
});

Deno.test("stringbool rejects other strings with InvalidValue", () => {
	for (const input of ["maybe", "", "2", "truthy", "o n"]) {
		// Given: a default stringbool schema
		const schema = stringbool();

		// When: parsing a string in neither list
		const result = parseSync(schema, input);

		// Then: it fails listing the accepted words
		assertEquals(
			result,
			Err(ParseError(InvalidValue({ input, expected: DEFAULT_WORDS }))),
			JSON.stringify(input),
		);
	}
});

Deno.test("stringbool rejects non-strings with InvalidType", () => {
	for (const input of [true, 1, null, undefined]) {
		// Given: a default stringbool schema
		const schema = stringbool();

		// When: parsing a value that is not a string
		const result = parseSync(schema, input);

		// Then: it fails expecting a string
		assertEquals(
			result,
			Err(ParseError(InvalidType({ input, expected: "string" }))),
		);
	}
});

Deno.test("stringbool uses configured word lists in place of the defaults", () => {
	// Given: a stringbool schema with its own words
	const schema = stringbool({ truthy: ["Oui"], falsy: ["non"] });

	// When: parsing the configured words and a default one
	// Then: the configured words read, matched ignoring case, and defaults fail
	assertEquals(parseSync(schema, "oui"), Ok(true));
	assertEquals(parseSync(schema, " NON "), Ok(false));
	assertEquals(
		parseSync(schema, "yes"),
		Err(ParseError(InvalidValue({ input: "yes", expected: ["Oui", "non"] }))),
	);
});

Deno.test("stringbool panics on a word in both lists", () => {
	// Given: word lists sharing a word, up to case
	// When: building the schema
	// Then: it panics with a RangeError
	assertThrows(
		() => stringbool({ truthy: ["yes", "Sure"], falsy: ["no", "sure"] }),
		RangeError,
		"sure",
	);
});
