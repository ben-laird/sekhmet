import { InvalidFormat } from "@/src/core/mini/issue.ts";
import type { Inspect } from "./check.ts";

/**
 * The pattern the `"email"` {@linkcode StringFormat} checks: a pragmatic
 * subset of addresses, not RFC 5322. The local part is ASCII letters, digits
 * and `_ ' + - .`, with no leading, trailing or consecutive dots; the domain
 * is dot-separated labels of letters, digits and inner hyphens, ending in a
 * top-level domain of two or more letters. Quoted local parts, IP-literal
 * domains and non-ASCII (unencoded internationalized) addresses are
 * rejected.
 */
export const EMAIL_PATTERN: RegExp =
	/^(?!\.)(?!.*\.\.)[A-Za-z0-9_'+\-.]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * The pattern the `"uuid"` {@linkcode StringFormat} checks: an RFC 9562 UUID
 * in its hyphenated hex form, any case, of a defined version (1 to 8) and
 * the RFC variant, or the nil (all zeros) or max (all `f`) UUID.
 */
export const UUID_PATTERN: RegExp =
	/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

/**
 * A named string format, as `string({ format })` checks it. A string that
 * doesn't match fails with an `InvalidFormat` issue naming the format (and
 * carrying the pattern, for `"email"` and `"uuid"`). The names are JSON
 * Schema's.
 *
 * - `"email"`: matches {@linkcode EMAIL_PATTERN}, a pragmatic pattern, not
 *   RFC 5322.
 * - `"url"`: an absolute URL by the WHATWG URL Standard (what `new URL(value)`
 *   accepts, tested with `URL.canParse`). Any scheme is accepted, so
 *   `mailto:` and `data:` URLs pass; add a `regex` to restrict it.
 * - `"uuid"`: matches {@linkcode UUID_PATTERN}.
 * - `"date"`: an ISO 8601 calendar date, `YYYY-MM-DD`, that exists (so
 *   `2023-02-29` fails but `2024-02-29` passes).
 * - `"time"`: an ISO 8601 time of day without an offset, `HH:MM`,
 *   `HH:MM:SS` or `HH:MM:SS.fraction` (24-hour, no leap second).
 * - `"date-time"`: a `"date"`, `T`, a `"time"`, then `Z` or `±HH:MM` (as RFC
 *   3339 requires, since a date-time without an offset is ambiguous).
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { type StringFormat, string } from "@sekhmet/schema/primitives/mini";
 *
 * const format: StringFormat = "date-time";
 * const instant = string({ format });
 *
 * assertEquals(isOk(parseSync(instant, "2026-11-16T09:30+05:30")), true);
 * assertEquals(isErr(parseSync(instant, "2026-11-16T09:30:00")), true);
 * ```
 */
export type StringFormat =
	| "email"
	| "url"
	| "uuid"
	| "date"
	| "time"
	| "date-time";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;
const OFFSET = /^(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth({ year, month }: { year: number; month: number }): number {
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

	return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth({ year: y, month: m });
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

/** How each format is tested, and the pattern its issue carries, if any. */
const FORMATS: Readonly<
	Record<
		StringFormat,
		{ readonly test: (value: string) => boolean; readonly pattern?: RegExp }
	>
> = {
	email: { test: (value) => EMAIL_PATTERN.test(value), pattern: EMAIL_PATTERN },
	url: { test: (value) => URL.canParse(value) },
	uuid: { test: (value) => UUID_PATTERN.test(value), pattern: UUID_PATTERN },
	date: { test: isIsoDate },
	time: { test: isIsoTime },
	"date-time": { test: isIsoDateTime },
};

/** Fails a string that isn't in `name`'s format with `InvalidFormat`. */
export function format(name: StringFormat): Inspect<string> {
	const { test, pattern } = FORMATS[name];

	return (value) => {
		if (test(value)) return undefined;

		return pattern === undefined
			? InvalidFormat({ input: value, format: name })
			: InvalidFormat({ input: value, format: name, pattern });
	};
}
