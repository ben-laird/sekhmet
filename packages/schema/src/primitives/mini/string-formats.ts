import { InvalidFormat, type SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Schema } from "@/src/core/mini/schema.ts";
import { check } from "./check.ts";

/**
 * The pattern {@linkcode email} checks: a pragmatic subset of addresses, not
 * RFC 5322. The local part is ASCII letters, digits and `_ ' + - .`, with no
 * leading, trailing or consecutive dots; the domain is dot-separated labels
 * of letters, digits and inner hyphens, ending in a top-level domain of two
 * or more letters. Quoted local parts, IP-literal domains and non-ASCII
 * (unencoded internationalized) addresses are rejected.
 */
export const EMAIL_PATTERN: RegExp =
	/^(?!\.)(?!.*\.\.)[A-Za-z0-9_'+\-.]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * The pattern {@linkcode uuid} checks: an RFC 9562 UUID in its hyphenated
 * hex form, any case, of a defined version (1 to 8) and the RFC variant,
 * or the nil (all zeros) or max (all `f`) UUID.
 */
export const UUID_PATTERN: RegExp =
	/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

/** Checks a string against a named format, failing with `InvalidFormat`. */
function format<I, E>({
	self,
	name,
	test,
	pattern,
}: {
	self: Schema<I, string, E>;
	name: string;
	test: (value: string) => boolean;
	pattern?: RegExp;
}): Schema<I, string, E | SchemaIssue> {
	return check(self, (value) => {
		if (test(value)) return undefined;

		return pattern === undefined
			? InvalidFormat({ input: value, format: name })
			: InvalidFormat({ input: value, format: name, pattern });
	});
}

/**
 * Checks that a string is an email address matching
 * {@linkcode EMAIL_PATTERN}, failing with an `InvalidFormat` issue (format
 * `"email"`). The pattern is deliberately pragmatic, not RFC 5322: it
 * accepts the addresses people type and rejects the exotic forms mail
 * systems rarely support.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects non-email strings
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { email, string } from "@sekhmet/schema/primitives/mini";
 *
 * const address = email(string());
 *
 * assertEquals(isOk(parseSync(address, "ada+news@example.co.uk")), true);
 * assertEquals(isErr(parseSync(address, "ada@localhost")), true);
 * ```
 */
export function email<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({
		self,
		name: "email",
		test: (value) => EMAIL_PATTERN.test(value),
		pattern: EMAIL_PATTERN,
	});
}

/**
 * Checks that a string is an absolute URL by the WHATWG URL Standard (what
 * `new URL(value)` accepts, tested with `URL.canParse`), failing with an
 * `InvalidFormat` issue (format `"url"`). Any scheme is accepted, so
 * `mailto:` and `data:` URLs pass; chain {@linkcode regex} to restrict it.
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects strings that are not URLs
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string, url } from "@sekhmet/schema/primitives/mini";
 *
 * const link = url(string());
 *
 * assertEquals(isOk(parseSync(link, "https://example.com/a?b=c")), true);
 * assertEquals(isErr(parseSync(link, "example.com")), true);
 * ```
 */
export function url<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({ self, name: "url", test: (value) => URL.canParse(value) });
}

/**
 * Checks that a string is a UUID matching {@linkcode UUID_PATTERN}, failing
 * with an `InvalidFormat` issue (format `"uuid"`).
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects non-UUID strings
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { string, uuid } from "@sekhmet/schema/primitives/mini";
 *
 * const id = uuid(string());
 *
 * assertEquals(isOk(parseSync(id, "550e8400-e29b-41d4-a716-446655440000")), true);
 * assertEquals(isErr(parseSync(id, "550e8400")), true);
 * ```
 */
export function uuid<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({
		self,
		name: "uuid",
		test: (value) => UUID_PATTERN.test(value),
		pattern: UUID_PATTERN,
	});
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;
const OFFSET = /^(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28;

	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Whether a string is a `YYYY-MM-DD` date that exists in the calendar. */
function isIsoDate(value: string): boolean {
	const [, year, month, day] = DATE.exec(value) ?? [];
	if (year === undefined || month === undefined || day === undefined) {
		return false;
	}

	const [y, m, d] = [Number(year), Number(month), Number(day)];

	return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function isIsoTime(value: string): boolean {
	return TIME.test(value);
}

/** Whether a string is an ISO date, `T`, an ISO time and a UTC offset. */
function isIsoDateTime(value: string): boolean {
	const [datePart = "", rest = ""] = value.split("T");
	const offsetAt = rest.search(/[Z+-]/);
	if (offsetAt < 0) return false;

	return (
		value.split("T").length === 2 &&
		isIsoDate(datePart) &&
		isIsoTime(rest.slice(0, offsetAt)) &&
		OFFSET.test(rest.slice(offsetAt))
	);
}

/**
 * Checks that a string is an ISO 8601 calendar date, `YYYY-MM-DD`, that
 * exists (so `2023-02-29` fails but `2024-02-29` passes), failing with an
 * `InvalidFormat` issue (format `"date"`).
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects strings that are not ISO dates
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { isoDate, string } from "@sekhmet/schema/primitives/mini";
 *
 * const day = isoDate(string());
 *
 * assertEquals(isOk(parseSync(day, "2024-02-29")), true);
 * assertEquals(isErr(parseSync(day, "2023-02-29")), true);
 * ```
 */
export function isoDate<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({ self, name: "date", test: isIsoDate });
}

/**
 * Checks that a string is an ISO 8601 time of day without an offset,
 * `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fraction` (24-hour, no leap second),
 * failing with an `InvalidFormat` issue (format `"time"`).
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects strings that are not ISO times
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { isoTime, string } from "@sekhmet/schema/primitives/mini";
 *
 * const time = isoTime(string());
 *
 * assertEquals(isOk(parseSync(time, "23:59:59.999")), true);
 * assertEquals(isErr(parseSync(time, "24:00")), true);
 * ```
 */
export function isoTime<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({ self, name: "time", test: isIsoTime });
}

/**
 * Checks that a string is an ISO 8601 date-time with a UTC offset: an
 * {@linkcode isoDate}, `T`, an {@linkcode isoTime}, then `Z` or `±HH:MM`
 * (as RFC 3339 requires, since a date-time without an offset is
 * ambiguous). It fails with an `InvalidFormat` issue (format
 * `"date-time"`).
 *
 * @template I The schema's input type
 * @template E The schema's error type
 * @param self The string schema to check
 * @returns A schema that also rejects strings that are not ISO date-times
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { isoDateTime, string } from "@sekhmet/schema/primitives/mini";
 *
 * const instant = isoDateTime(string());
 *
 * assertEquals(isOk(parseSync(instant, "2026-11-16T09:30:00Z")), true);
 * assertEquals(isOk(parseSync(instant, "2026-11-16T09:30+05:30")), true);
 * assertEquals(isErr(parseSync(instant, "2026-11-16T09:30:00")), true);
 * ```
 */
export function isoDateTime<I, E>(
	self: Schema<I, string, E>,
): Schema<I, string, E | SchemaIssue> {
	return format({ self, name: "date-time", test: isIsoDateTime });
}
