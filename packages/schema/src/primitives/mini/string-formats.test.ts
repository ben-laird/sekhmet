import { Err, Ok } from "@sekhmet/enum/result/mini";
import { block } from "@sekhmet/primordials/scoping";
import { assertEquals } from "@std/assert";
import { InvalidFormat, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { ParseError, parseSync, type Schema } from "@/src/core/mini/schema.ts";
import { string } from "./string.ts";
import { EMAIL_PATTERN, UUID_PATTERN } from "./string-formats.ts";

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
