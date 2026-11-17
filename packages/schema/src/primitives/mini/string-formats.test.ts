import { Err, Ok } from "@sekhmet/enum/result/mini";
import { matrix } from "@sekhmet/matrix";
import { block } from "@sekhmet/primordials/scoping";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { InvalidFormat, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync, type Schema } from "@/src/core/mini/schema.ts";
import { type StringSchemaOptions, string } from "./string.ts";
import {
	EMAIL_PATTERN,
	type FractionalDigits,
	type OffsetRule,
	type StringFormat,
	type TimeFormat,
	UUID_PATTERN,
} from "./string-formats.ts";

/** One format's cases: the strings it accepts and those it rejects. */
interface Table {
	readonly format: string;
	readonly schema: Schema<unknown, string, SchemaIssue>;
	readonly pattern?: RegExp;
	readonly valid: readonly string[];
	readonly invalid: readonly string[];
}

function runTable(table: Table): void {
	Deno.test(`${table.format} accepts valid strings`, () => {
		for (const input of table.valid) {
			// Given: the format's schema
			// When: parsing a valid string
			const result = parseSync(table.schema, input);

			// Then: it is accepted unchanged
			assertEquals(result, Ok(input), input);
		}
	});
	Deno.test(`${table.format} rejects invalid strings with InvalidFormat`, () => {
		for (const input of table.invalid) {
			// Given: the format's schema
			// When: parsing an invalid string
			const result = parseSync(table.schema, input);

			// Then: it fails naming the format (and its pattern, if any)
			const issue = block(() => {
				if (table.pattern === undefined) {
					return InvalidFormat({ input, format: table.format });
				}

				return InvalidFormat({
					input,
					format: table.format,
					pattern: table.pattern,
				});
			});
			assertEquals(result, Err(ParseError(issue)), input);
		}
	});
}

runTable({
	format: "email",
	schema: string({ format: "email" }),
	pattern: EMAIL_PATTERN,
	valid: [
		"ada@example.com",
		"ada.lovelace@example.co.uk",
		"ada+news@example.com",
		"o'brien@example.ie",
		"a_b-c@sub-domain.example.org",
		"A@EXAMPLE.COM",
		"1@x.io",
	],
	invalid: [
		"",
		"ada",
		"ada@",
		"@example.com",
		"ada@localhost",
		"ada@example",
		"ada@example.c",
		".ada@example.com",
		"ada.@example.com",
		"ada..l@example.com",
		"ada@-example.com",
		"ada@example-.com",
		"ada@example..com",
		"ada lovelace@example.com",
		'"ada"@example.com',
		"ada@[127.0.0.1]",
		"adá@example.com",
		"ada@example.com ",
	],
});

runTable({
	format: "url",
	schema: string({ format: "url" }),
	valid: [
		"https://example.com",
		"http://localhost:8000/path?q=1#frag",
		"https://user:pass@example.com",
		"ftp://example.com/file",
		"mailto:ada@example.com",
		"data:text/plain,hi",
		"file:///tmp/x",
	],
	invalid: [
		"",
		"example.com",
		"/relative/path",
		"http://",
		"https://exa mple.com",
		"://x",
	],
});

runTable({
	format: "uuid",
	schema: string({ format: "uuid" }),
	pattern: UUID_PATTERN,
	valid: [
		"550e8400-e29b-41d4-a716-446655440000",
		"550E8400-E29B-41D4-A716-446655440000",
		"6ba7b810-9dad-11d1-80b4-00c04fd430c8",
		"01890a5d-ac96-774b-bcce-b302099a8057",
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-ffff-ffff-ffff-ffffffffffff",
	],
	invalid: [
		"",
		"550e8400e29b41d4a716446655440000",
		"550e8400-e29b-01d4-a716-446655440000",
		"550e8400-e29b-91d4-a716-446655440000",
		"550e8400-e29b-41d4-c716-446655440000",
		"550e8400-e29b-41d4-a716-44665544000",
		"{550e8400-e29b-41d4-a716-446655440000}",
		"g50e8400-e29b-41d4-a716-446655440000",
	],
});

runTable({
	format: "date",
	schema: string({ format: "date" }),
	valid: ["2026-11-16", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"],
	invalid: [
		"",
		"2026-1-16",
		"26-11-16",
		"2026/11/16",
		"2026-13-01",
		"2026-00-10",
		"2026-11-00",
		"2026-11-31",
		"2023-02-29",
		"1900-02-29",
		"2026-11-16T00:00:00Z",
		" 2026-11-16",
	],
});

runTable({
	format: "time",
	schema: string({ format: "time" }),
	valid: [
		"00:00",
		"23:59",
		"09:30:00",
		"23:59:59",
		"12:00:00.5",
		"12:00:00.123456",
	],
	invalid: [
		"",
		"24:00",
		"9:30",
		"12:60",
		"12:00:60",
		"12:00:00.",
		"12:00Z",
		"12:00+01:00",
		"1200",
	],
});

runTable({
	format: "date-time",
	schema: string({ format: "date-time" }),
	valid: [
		"2026-11-16T09:30:00Z",
		"2026-11-16T09:30Z",
		"2026-11-16T09:30:00.123Z",
		"2026-11-16T09:30:00+05:30",
		"2026-11-16T09:30:00-08:00",
		"2024-02-29T23:59:59Z",
	],
	invalid: [
		"",
		"2026-11-16",
		"2026-11-16T09:30:00",
		"2026-11-16 09:30:00Z",
		"2026-11-16t09:30:00Z",
		"2023-02-29T09:30:00Z",
		"2026-11-16T24:00:00Z",
		"2026-11-16T09:30:00+5:30",
		"2026-11-16T09:30:00+24:00",
		"2026-11-16T09:30:00ZZ",
		"2026-11-16T09:30:00Z+01:00",
		"2026-11-16T09:30T00Z",
	],
});

type TimeName = TimeFormat["name"];

const NAMES: TimeName[] = ["time", "date-time"];
const OFFSETS: OffsetRule[] = ["required", "allowed", "forbidden"];
const PRECISIONS: FractionalDigits[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** A time of day, or a date and that time, for a time format name. */
function stamp({ name, time }: { name: TimeName; time: string }): string {
	if (name === "time") return time;

	return `2026-11-16T${time}`;
}

/** `digits` fraction digits after a decimal mark; none for `0`. */
function fraction(digits: number): string {
	if (digits === 0) return "";

	return `.${"7".repeat(digits)}`;
}

/** What parsing `input` gives: itself if `accepted`, else the format's issue. */
function outcome({
	accepted,
	input,
	name,
}: {
	accepted: boolean;
	input: string;
	name: TimeName;
}) {
	if (accepted) return Ok(input);

	return Err(ParseError(InvalidFormat({ input, format: name })));
}

for (const { name, offset, zone } of matrix<{
	name: TimeName;
	offset: OffsetRule;
	zone: string;
}>({
	name: NAMES,
	offset: OFFSETS,
	zone: ["", "Z", "+05:30", "-08:00", "+00:00", "-00:00", "+23:59"],
})) {
	Deno.test(`${name} with offset "${offset}" on zone "${zone}"`, () => {
		// Given: a time format with an offset rule
		const schema = string({ format: { name, offset } });
		const input = stamp({ name, time: `09:30:00${zone}` });

		// When: parsing a time with or without a UTC offset
		const result = parseSync(schema, input);

		// Then: an offset passes unless forbidden, and none unless required
		const accepted = block(() => {
			if (zone === "") return offset !== "required";

			return offset !== "forbidden";
		});
		assertEquals(result, outcome({ accepted, input, name }));
	});
}

for (const { name, offset, zone } of matrix<{
	name: TimeName;
	offset: OffsetRule;
	zone: string;
}>({
	name: NAMES,
	offset: OFFSETS,
	zone: [
		"z",
		"+24:00",
		"-24:00",
		"+05:60",
		"+0530",
		"+5:30",
		"+05",
		"05:30",
		"ZZ",
		"Z+01:00",
		"+05:30Z",
		" Z",
		"UTC",
	],
})) {
	Deno.test(`${name} with offset "${offset}" rejects the zone "${zone}"`, () => {
		// Given: a time format with any offset rule
		const schema = string({ format: { name, offset } });
		const input = stamp({ name, time: `09:30:00${zone}` });

		// When: parsing a time with a malformed offset
		const result = parseSync(schema, input);

		// Then: it fails naming the format
		assertEquals(result, outcome({ accepted: false, input, name }));
	});
}

for (const { name, precision, digits } of matrix<{
	name: TimeName;
	precision: FractionalDigits;
	digits: number;
}>({
	name: NAMES,
	precision: PRECISIONS,
	digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
})) {
	Deno.test(`${name} with precision ${precision} on ${digits} digits`, () => {
		// Given: a time format with an exact fractional-second precision
		const schema = string({ format: { name, precision, offset: "allowed" } });
		const input = stamp({ name, time: `23:59:59${fraction(digits)}Z` });

		// When: parsing a time with some number of fraction digits
		const result = parseSync(schema, input);

		// Then: exactly `precision` digits pass, and any other count fails
		assertEquals(
			result,
			outcome({ accepted: digits === precision, input, name }),
		);
	});
}

for (const { name, precision, zone } of matrix<{
	name: TimeName;
	precision: FractionalDigits | "any";
	zone: string;
}>({
	name: NAMES,
	precision: ["any", ...PRECISIONS],
	zone: ["", "Z"],
})) {
	Deno.test(`${name} at precision ${precision} rejects a leap second`, () => {
		// Given: a time format at any precision, offset optional
		const format: TimeFormat = { name, offset: "allowed" };
		const schema = string({
			format: precision === "any" ? format : { ...format, precision },
		});
		const digits = precision === "any" ? 0 : precision;
		const input = stamp({ name, time: `23:59:60${fraction(digits)}${zone}` });

		// When: parsing second 60, which only a leap second has
		const result = parseSync(schema, input);

		// Then: it fails, since these formats have no leap second
		assertEquals(result, outcome({ accepted: false, input, name }));
	});
}

Deno.test("a precision makes the seconds required", () => {
	// Given: times of exactly 0 and 3 fraction digits
	const whole = string({ format: { name: "time", precision: 0 } });
	const millis = string({ format: { name: "time", precision: 3 } });

	// When: parsing a time without seconds, and the times they want
	// Then: the time without seconds fails both, and the wanted ones pass
	assertEquals(
		parseSync(whole, "09:30"),
		outcome({ accepted: false, input: "09:30", name: "time" }),
	);
	assertEquals(
		parseSync(millis, "09:30"),
		outcome({ accepted: false, input: "09:30", name: "time" }),
	);
	assertEquals(parseSync(whole, "09:30:15"), Ok("09:30:15"));
	assertEquals(parseSync(millis, "09:30:15.250"), Ok("09:30:15.250"));
});

Deno.test("without a precision, the seconds and any fraction are optional", () => {
	// Given: a time format with only an offset rule
	const schema = string({ format: { name: "time", offset: "allowed" } });
	const valid = ["09:30", "09:30:15", "09:30:15.1", "09:30:15.123456789012"];
	const invalid = ["09:30:15.", "09:30:15,5", "09:30.5", "09:30:15.5.5"];

	// When: parsing times at minute, second and long fraction precision
	// Then: all pass, but a bare decimal mark or a comma fails
	for (const input of valid) {
		assertEquals(parseSync(schema, input), Ok(input), input);
	}
	for (const input of invalid) {
		assertEquals(
			parseSync(schema, input),
			outcome({ accepted: false, input, name: "time" }),
			input,
		);
	}
});

Deno.test("a time format with options still checks the time of day", () => {
	// Given: a time format with every option set
	const schema = string({
		format: { name: "time", precision: 0, offset: "allowed" },
	});
	const invalid = ["24:00:00", "9:30:00", "12:60:00", "12:00:5", "120000", ""];

	// When: parsing times out of range or out of shape
	// Then: each fails naming the format
	for (const input of invalid) {
		assertEquals(
			parseSync(schema, input),
			outcome({ accepted: false, input, name: "time" }),
			input,
		);
	}
});

Deno.test("a date-time format with options still checks the calendar", () => {
	// Given: a millisecond, offset-optional date-time
	const schema = string({
		format: { name: "date-time", precision: 3, offset: "allowed" },
	});
	const valid = ["2024-02-29T23:59:59.999Z", "2026-11-16T00:00:00.000"];
	const invalid = [
		"2023-02-29T00:00:00.000Z",
		"2026-13-01T00:00:00.000Z",
		"2026-11-31T00:00:00.000",
		"2026-11-16t00:00:00.000Z",
		"2026-11-16 00:00:00.000Z",
		"2026-11-16T00:00:00.000Z ",
		"2026-11-16T",
		"2026-11-16",
	];

	// When: parsing real and impossible dates, and malformed date-times
	// Then: only the real, well-formed ones pass
	for (const input of valid) {
		assertEquals(parseSync(schema, input), Ok(input), input);
	}
	for (const input of invalid) {
		assertEquals(
			parseSync(schema, input),
			outcome({ accepted: false, input, name: "date-time" }),
			input,
		);
	}
});

Deno.test("a bare time name is its TimeFormat with every option left out", () => {
	// Given: inputs with and without seconds, fractions and offsets
	const inputs = [
		"09:30",
		"09:30:00.5",
		"09:30Z",
		"2026-11-16T09:30Z",
		"2026-11-16T09:30:00.123+05:30",
		"2026-11-16T09:30:00",
	];

	for (const name of NAMES) {
		// When: parsing them with the bare name and the object without options
		const bare = inputs.map((input) => {
			return parseSync(string({ format: name }), input);
		});
		const spelled = inputs.map((input) => {
			return parseSync(string({ format: { name } }), input);
		});

		// Then: the two agree on every input
		assertEquals(spelled, bare, name);
	}
});

Deno.test("the time format option types", () => {
	// Given: the option types
	// When: reading them
	// Then: precision is 0 to 9 digits, and the offset one of three rules
	assertType<IsExact<FractionalDigits, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>>(
		true,
	);
	assertType<IsExact<OffsetRule, "required" | "allowed" | "forbidden">>(true);
	assertType<IsExact<TimeName, "time" | "date-time">>(true);
	assertType<
		IsExact<
			StringSchemaOptions["format"],
			StringFormat | TimeFormat | undefined
		>
	>(true);

	// @ts-expect-error: precision is at most 9 digits
	const tooPrecise: TimeFormat = { name: "time", precision: 10 };
	// @ts-expect-error: the offset is one of three rules
	const vague: TimeFormat = { name: "time", offset: "maybe" };
	// @ts-expect-error: only the time formats take options
	const dated: TimeFormat = { name: "date", precision: 3 };
	assertEquals([tooPrecise, vague, dated].length, 3);
});
