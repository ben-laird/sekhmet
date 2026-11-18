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
 *   accepts, tested with `URL.canParse`), with the same answer on every
 *   runtime: a space in an `http(s)`, `ws(s)`, `ftp` or `file` host fails
 *   even where the runtime's parser accepts it (Chromium does). Any scheme is
 *   accepted, so `mailto:` and `data:` URLs pass; add a `regex` to restrict it.
 * - `"uuid"`: matches {@linkcode UUID_PATTERN}.
 * - `"date"`: an ISO 8601 calendar date, `YYYY-MM-DD`, that exists (so
 *   `2023-02-29` fails but `2024-02-29` passes).
 * - `"time"`: an ISO 8601 time of day, `HH:MM`, `HH:MM:SS` or
 *   `HH:MM:SS.fraction` (24-hour, no leap second), without an offset.
 * - `"date-time"`: a `"date"`, `T`, a `"time"`, then a UTC offset, `Z` or
 *   `±HH:MM` (as RFC 3339 requires, since a date-time without an offset is
 *   ambiguous).
 *
 * The two time formats take options, given as a {@linkcode TimeFormat}
 * (`format: { name: "date-time", precision: 3 }`); the bare name is the
 * same format with every option at its default.
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

/**
 * How many digits a time's fractional seconds have, from `0` (whole
 * seconds, no fraction) to `9` (nanoseconds, as `Temporal` keeps them).
 */
export type FractionalDigits = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Whether a time carries a UTC offset, `Z` or `±HH:MM`: it must
 * (`"required"`), it may (`"allowed"`), or it must not (`"forbidden"`, a
 * local time).
 */
export type OffsetRule = "required" | "allowed" | "forbidden";

/**
 * A time format, `"time"` or `"date-time"`, with its options. Each option
 * left out keeps the bare name's behavior, so `{ name: "time" }` is
 * `"time"`.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { type TimeFormat, string } from "@sekhmet/schema/primitives/mini";
 *
 * const millis: TimeFormat = { name: "date-time", precision: 3 };
 * const local: TimeFormat = { name: "date-time", offset: "forbidden" };
 *
 * assertEquals(isOk(parseSync(string({ format: millis }), "2026-11-16T09:30:00.250Z")), true);
 * assertEquals(isErr(parseSync(string({ format: millis }), "2026-11-16T09:30:00Z")), true);
 * assertEquals(isOk(parseSync(string({ format: local }), "2026-11-16T09:30")), true);
 * assertEquals(isErr(parseSync(string({ format: local }), "2026-11-16T09:30Z")), true);
 * ```
 */
export interface TimeFormat {
	/** Which time format: a time of day, or a date and a time. */
	readonly name: "time" | "date-time";

	/**
	 * Exactly how many fractional-second digits the time has. Setting it
	 * makes the seconds required: `0` allows `HH:MM:SS` only, `3` allows
	 * `HH:MM:SS.sss` only. Left out, the seconds and any number of fraction
	 * digits are optional.
	 */
	readonly precision?: FractionalDigits;

	/**
	 * Whether the time carries a UTC offset (see {@linkcode OffsetRule}).
	 *
	 * @default "forbidden" for `"time"`, `"required"` for `"date-time"`
	 */
	readonly offset?: OffsetRule;
}

/** The time format names, which take a {@linkcode TimeFormat}'s options. */
type TimeFormatName = TimeFormat["name"];

/** The offset each time format has when its options leave it out. */
const DEFAULT_OFFSET: Readonly<Record<TimeFormatName, OffsetRule>> = {
	time: "forbidden",
	"date-time": "required",
};

// Fragments composed into the time patterns, written as literals so no
// escape is doubled (the archived prototype's `"\\d"` bug).
const DATE_SHAPE = /(\d{4})-(\d{2})-(\d{2})/;
const HOUR = /(?:[01]\d|2[0-3])/;
const SEXAGESIMAL = /[0-5]\d/;
const FRACTION_MARK = /\./;
const DIGIT = /\d/;
const UTC_OFFSET = /(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)/;

const DATE = new RegExp(`^${DATE_SHAPE.source}$`);

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth({ year, month }: { year: number; month: number }): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28;

	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Whether `DATE_SHAPE`'s captures, as `exec` returns them, name a day that
 * exists in the calendar. A failed match has none.
 */
function isCalendarDate(match: RegExpExecArray | null): boolean {
	const [, year, month, day] = match ?? [];
	if (year === undefined || month === undefined || day === undefined) {
		return false;
	}

	const [y, m, d] = [Number(year), Number(month), Number(day)];

	return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth({ year: y, month: m });
}

/** The fractional seconds `precision` allows, as a pattern source. */
function fractionSource(precision: FractionalDigits | undefined): string {
	if (precision === undefined) {
		return `(?:${FRACTION_MARK.source}${DIGIT.source}+)?`;
	}
	if (precision === 0) return "";

	return `${FRACTION_MARK.source}${DIGIT.source}{${precision}}`;
}

/** The time of day `precision` and `offset` allow, as a pattern source. */
function timeSource({
	precision,
	offset,
}: {
	precision: FractionalDigits | undefined;
	offset: OffsetRule;
}): string {
	const seconds = `:${SEXAGESIMAL.source}${fractionSource(precision)}`;
	const zone = {
		required: UTC_OFFSET.source,
		allowed: `${UTC_OFFSET.source}?`,
		forbidden: "",
	}[offset];
	const optionalSeconds = precision === undefined ? `(?:${seconds})?` : seconds;

	return `${HOUR.source}:${SEXAGESIMAL.source}${optionalSeconds}${zone}`;
}

/** How a time format is tested, given its options. */
function timeTest({
	name,
	precision,
	offset,
}: TimeFormat): (value: string) => boolean {
	const time = timeSource({
		precision,
		offset: offset ?? DEFAULT_OFFSET[name],
	});
	if (name === "time") {
		const pattern = new RegExp(`^${time}$`);

		return (value) => pattern.test(value);
	}

	const pattern = new RegExp(`^${DATE_SHAPE.source}T${time}$`);

	return (value) => isCalendarDate(pattern.exec(value));
}

/** The URL Standard's special schemes, whose hosts are domains. */
const SPECIAL_SCHEME = /^(?:https?|wss?|ftp|file):$/;

/**
 * Whether `value` is an absolute URL by the URL Standard on every runtime.
 * Chromium also accepts a space in a host (as `%20`), but a standard domain
 * never keeps a `%` once parsed.
 */
function isStandardUrl(value: string): boolean {
	if (!URL.canParse(value)) {
		return false;
	}
	const { protocol, hostname } = new URL(value);

	return !(SPECIAL_SCHEME.test(protocol) && hostname.includes("%"));
}

/** How each non-time format is tested, and the pattern its issue carries. */
const FORMATS: Readonly<
	Record<
		Exclude<StringFormat, TimeFormatName>,
		{ readonly test: (value: string) => boolean; readonly pattern?: RegExp }
	>
> = {
	email: { test: (value) => EMAIL_PATTERN.test(value), pattern: EMAIL_PATTERN },
	url: { test: isStandardUrl },
	uuid: { test: (value) => UUID_PATTERN.test(value), pattern: UUID_PATTERN },
	date: { test: (value) => isCalendarDate(DATE.exec(value)) },
};

/** A format option spelled out: its name, its test and its issue's pattern. */
interface FormatCheck {
	readonly name: StringFormat;
	readonly test: (value: string) => boolean;
	readonly pattern?: RegExp;
}

/** Spells out a format option: a bare time name is its default options. */
function formatCheck(option: StringFormat | TimeFormat): FormatCheck {
	if (typeof option === "object") {
		return { name: option.name, test: timeTest(option) };
	}
	if (option === "time" || option === "date-time") {
		return { name: option, test: timeTest({ name: option }) };
	}

	return { name: option, ...FORMATS[option] };
}

/**
 * Fails a string that isn't in `option`'s format with `InvalidFormat`,
 * naming the format.
 */
export function format(option: StringFormat | TimeFormat): Inspect<string> {
	const { name, test, pattern } = formatCheck(option);

	return (value) => {
		if (test(value)) return undefined;
		if (pattern === undefined) {
			return InvalidFormat({ input: value, format: name });
		}

		return InvalidFormat({ input: value, format: name, pattern });
	};
}
