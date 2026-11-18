/**
 * The built-in schemas' error: {@linkcode SchemaIssue}, an enum of why a value
 * was rejected, with a constructor per variant ({@linkcode InvalidType},
 * {@linkcode InvalidValue}, {@linkcode InvalidFormat}, {@linkcode TooSmall},
 * {@linkcode TooBig}, {@linkcode NotMultipleOf}, {@linkcode UnknownKey},
 * {@linkcode InvalidUnion}, {@linkcode Custom}) and its details types,
 * {@linkcode isSchemaIssue}, {@linkcode formatIssue} for a default message, and
 * {@linkcode typeName} for naming a value's runtime type.
 *
 * @module
 */

import { Enum, type Split } from "@sekhmet/enum/core/mini/core";
import { match } from "@sekhmet/enum/core/mini/exit";
import type { Issues } from "./issues.ts";

/**
 * The name of a runtime value's type, as a {@linkcode SchemaIssue} reports
 * what it received: `typeof`, refined to tell `null`, arrays, dates and the
 * non-finite numbers apart.
 */
export type TypeName =
	| "undefined"
	| "null"
	| "boolean"
	| "number"
	| "nan"
	| "infinity"
	| "bigint"
	| "string"
	| "symbol"
	| "function"
	| "array"
	| "date"
	| "invalid date"
	| "object";

/**
 * Names the type of a runtime value.
 *
 * `NaN` is `"nan"`, `±Infinity` is `"infinity"`, and a `Date` whose time is
 * `NaN` is `"invalid date"`, so an issue can say why a strict number or date
 * schema rejected a value of the right `typeof`.
 *
 * @param value The value to name
 * @returns The value's {@linkcode TypeName}
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { typeName } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(typeName(null), "null");
 * assertEquals(typeName([1, 2]), "array");
 * assertEquals(typeName(Number.NaN), "nan");
 * assertEquals(typeName(new Date(Number.NaN)), "invalid date");
 * ```
 */
export function typeName(value: unknown): TypeName {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? "invalid date" : "date";
	}
	if (typeof value === "number") {
		if (Number.isNaN(value)) return "nan";
		if (!Number.isFinite(value)) return "infinity";
	}

	return typeof value;
}

/**
 * What a size check measured: a number or bigint's value, a date's time, or
 * a string's length, an array's length, a set's or map's size.
 */
export type Origin =
	| "number"
	| "bigint"
	| "date"
	| "string"
	| "array"
	| "set"
	| "map";

/**
 * The type of a bound for an {@linkcode Origin}: a `bigint` for bigints, a
 * `Date` for dates, and a `number` otherwise (a value, a length or a size).
 */
export type LimitOf<O extends Origin> = O extends "bigint"
	? bigint
	: O extends "date"
		? Date
		: number;

/** The details of a {@linkcode TooSmall} issue, discriminated by `origin`. */
export type TooSmallDetails = {
	[O in Origin]: {
		/** The rejected value. */
		readonly input: unknown;
		/** What was measured. */
		readonly origin: O;
		/** The bound the value fell below. */
		readonly minimum: LimitOf<O>;
		/** Whether the bound itself is allowed (`>=`) or not (`>`). */
		readonly inclusive: boolean;
	};
}[Origin];

/** The details of a {@linkcode TooBig} issue, discriminated by `origin`. */
export type TooBigDetails = {
	[O in Origin]: {
		/** The rejected value. */
		readonly input: unknown;
		/** What was measured. */
		readonly origin: O;
		/** The bound the value rose above. */
		readonly maximum: LimitOf<O>;
		/** Whether the bound itself is allowed (`<=`) or not (`<`). */
		readonly inclusive: boolean;
	};
}[Origin];

/** The details of a {@linkcode NotMultipleOf} issue, discriminated by `origin`. */
export type NotMultipleOfDetails =
	| {
			/** The rejected value. */
			readonly input: unknown;
			/** A number's value was checked. */
			readonly origin: "number";
			/** The number the value must be a multiple of. */
			readonly divisor: number;
	  }
	| {
			/** The rejected value. */
			readonly input: unknown;
			/** A bigint's value was checked. */
			readonly origin: "bigint";
			/** The bigint the value must be a multiple of. */
			readonly divisor: bigint;
	  };

/** The details of an {@linkcode InvalidType} issue. */
export interface InvalidTypeDetails {
	/** The rejected value. */
	readonly input: unknown;
	/** The type the schema accepts (e.g. `"string"`, `"date"`, `"object"`). */
	readonly expected: string;
	/** The type of the rejected value, from {@linkcode typeName}. */
	readonly received: TypeName;
}

/** The details of an {@linkcode InvalidValue} issue. */
export interface InvalidValueDetails {
	/** The rejected value. */
	readonly input: unknown;
	/** The allowed values (a literal, an enum's members, a word list). */
	readonly expected: readonly unknown[];
}

/** The details of an {@linkcode InvalidFormat} issue. */
export interface InvalidFormatDetails {
	/** The rejected value. */
	readonly input: unknown;
	/** The format's name (e.g. `"email"`, `"uuid"`, `"regex"`). */
	readonly format: string;
	/** The pattern the value had to match, when the format is one. */
	readonly pattern?: RegExp;
}

/** The details of an {@linkcode UnknownKey} issue. */
export interface UnknownKeyDetails {
	/** The value found under the undeclared key. */
	readonly input: unknown;
	/** The undeclared key. */
	readonly key: PropertyKey;
}

/** The details of an {@linkcode InvalidUnion} issue. */
export interface InvalidUnionDetails {
	/** The rejected value. */
	readonly input: unknown;
	/**
	 * Each branch's failure, in branch order, as located issues relative to
	 * the union (a branch failing with a bare error has it at the empty path).
	 */
	readonly branches: readonly Issues<unknown>[];
}

/** The details of a {@linkcode Custom} issue. */
export interface CustomDetails {
	/** The rejected value. */
	readonly input: unknown;
	/** Why the check failed. */
	readonly message: string;
}

/** The variants of a {@linkcode SchemaIssue}, each carrying its details. */
export type SchemaIssueVariants = Split<{
	InvalidType: [details: InvalidTypeDetails];
	InvalidValue: [details: InvalidValueDetails];
	InvalidFormat: [details: InvalidFormatDetails];
	TooSmall: [details: TooSmallDetails];
	TooBig: [details: TooBigDetails];
	NotMultipleOf: [details: NotMultipleOfDetails];
	UnknownKey: [details: UnknownKeyDetails];
	InvalidUnion: [details: InvalidUnionDetails];
	Custom: [details: CustomDetails];
}>;

/**
 * Why a built-in schema rejected a value. Every variant's details carry the
 * rejected `input`; {@linkcode formatIssue} renders a default message.
 *
 * | Variant         | Raised when                                     | Details besides `input`                     |
 * | --------------- | ----------------------------------------------- | ------------------------------------------- |
 * | `InvalidType`   | The value has the wrong type                    | `expected` (a type name), `received`        |
 * | `InvalidValue`  | The value is not one of the allowed values      | `expected` (the allowed values)             |
 * | `InvalidFormat` | A string format, affix or pattern check failed  | `format`, and `pattern` for a pattern       |
 * | `TooSmall`      | The value, length or size is below a minimum    | `origin`, `minimum`, `inclusive`            |
 * | `TooBig`        | The value, length or size is above a maximum    | `origin`, `maximum`, `inclusive`            |
 * | `NotMultipleOf` | A `multipleOf` check failed                     | `origin`, `divisor`                         |
 * | `UnknownKey`    | A `"strict"` object found an undeclared key     | `key` (`input` is the value under it)       |
 * | `InvalidUnion`  | No union branch accepted the value              | `branches`, each branch's `Issues`          |
 * | `Custom`        | A user check failed                             | `message`                                   |
 *
 * `received` is the input's {@linkcode TypeName}. `origin` says what was
 * measured (see {@linkcode Origin}) and fixes the bound's type (see
 * {@linkcode LimitOf}). Each variant has a constructor of the same name that
 * takes its details, except that {@linkcode InvalidType} derives `received`
 * from the input itself: `InvalidType({ input, expected })`.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { match } from "@sekhmet/enum/core/mini/exit";
 * import { InvalidType } from "@sekhmet/schema/core/mini/issue";
 *
 * const issue = InvalidType({ input: 42, expected: "string" });
 * const received = match(issue)({
 * 	InvalidType: (details) => details.received,
 * 	InvalidValue: () => undefined,
 * 	InvalidFormat: () => undefined,
 * 	TooSmall: () => undefined,
 * 	TooBig: () => undefined,
 * 	NotMultipleOf: () => undefined,
 * 	UnknownKey: () => undefined,
 * 	InvalidUnion: () => undefined,
 * 	Custom: () => undefined,
 * });
 *
 * assertEquals(received, "number");
 * ```
 */
export class SchemaIssue extends Enum<SchemaIssueVariants> {}

/**
 * Creates an `InvalidType` issue: the input is not of the expected type. The
 * received type is named from the input with {@linkcode typeName}.
 *
 * @param details The rejected input and the expected type's name
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, InvalidType } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(
 * 	formatIssue(InvalidType({ input: null, expected: "string" })),
 * 	"Expected string, received null",
 * );
 * ```
 */
export function InvalidType(
	details: Omit<InvalidTypeDetails, "received">,
): SchemaIssue {
	return new SchemaIssue("InvalidType", {
		input: details.input,
		expected: details.expected,
		received: typeName(details.input),
	});
}

/**
 * Creates an `InvalidValue` issue: the input is not one of the allowed values.
 *
 * @param details The rejected input and the allowed values
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, InvalidValue } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(
 * 	formatIssue(InvalidValue({ input: "maybe", expected: ["yes", "no"] })),
 * 	'Expected one of "yes", "no"',
 * );
 * ```
 */
export function InvalidValue(details: InvalidValueDetails): SchemaIssue {
	return new SchemaIssue("InvalidValue", details);
}

/**
 * Creates an `InvalidFormat` issue: a string format or pattern check failed.
 *
 * @param details The rejected input, the format's name and its pattern
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, InvalidFormat } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(
 * 	formatIssue(InvalidFormat({ input: "abc", format: "regex", pattern: /^\d+$/ })),
 * 	"Invalid regex: must match /^\\d+$/",
 * );
 * ```
 */
export function InvalidFormat(details: InvalidFormatDetails): SchemaIssue {
	return new SchemaIssue("InvalidFormat", details);
}

/**
 * Creates a `TooSmall` issue: the input is below a minimum. `origin` says
 * what was measured, and fixes the minimum's type (see {@linkcode LimitOf}).
 *
 * @param details The rejected input, the origin, the minimum and inclusivity
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, TooSmall } from "@sekhmet/schema/core/mini/issue";
 *
 * const issue = TooSmall({
 * 	input: "ab",
 * 	origin: "string",
 * 	minimum: 3,
 * 	inclusive: true,
 * });
 * assertEquals(formatIssue(issue), "Too small: expected string to have >= 3 characters");
 * ```
 */
export function TooSmall(details: TooSmallDetails): SchemaIssue {
	return new SchemaIssue("TooSmall", details);
}

/**
 * Creates a `TooBig` issue: the input is above a maximum, mirroring
 * {@linkcode TooSmall}.
 *
 * @param details The rejected input, the origin, the maximum and inclusivity
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, TooBig } from "@sekhmet/schema/core/mini/issue";
 *
 * const issue = TooBig({ input: 11, origin: "number", maximum: 10, inclusive: true });
 * assertEquals(formatIssue(issue), "Too big: expected number to be <= 10");
 * ```
 */
export function TooBig(details: TooBigDetails): SchemaIssue {
	return new SchemaIssue("TooBig", details);
}

/**
 * Creates a `NotMultipleOf` issue: a `multipleOf` check failed.
 *
 * @param details The rejected input, the origin and the divisor
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, NotMultipleOf } from "@sekhmet/schema/core/mini/issue";
 *
 * const issue = NotMultipleOf({ input: 7n, origin: "bigint", divisor: 2n });
 * assertEquals(formatIssue(issue), "Expected a multiple of 2n");
 * ```
 */
export function NotMultipleOf(details: NotMultipleOfDetails): SchemaIssue {
	return new SchemaIssue("NotMultipleOf", details);
}

/**
 * Creates an `UnknownKey` issue: a strict object received an undeclared key.
 *
 * @param details The value under the key, and the key
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, UnknownKey } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(
 * 	formatIssue(UnknownKey({ input: true, key: "admin" })),
 * 	'Unknown key "admin"',
 * );
 * ```
 */
export function UnknownKey(details: UnknownKeyDetails): SchemaIssue {
	return new SchemaIssue("UnknownKey", details);
}

/**
 * Creates an `InvalidUnion` issue: no union branch accepted the input.
 *
 * @param details The rejected input and each branch's issues
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import {
 * 	formatIssue,
 * 	InvalidType,
 * 	InvalidUnion,
 * } from "@sekhmet/schema/core/mini/issue";
 * import { fromError } from "@sekhmet/schema/core/mini/issues";
 *
 * const input = null;
 * const issue = InvalidUnion({
 * 	input,
 * 	branches: [
 * 		fromError(InvalidType({ input, expected: "string" })),
 * 		fromError(InvalidType({ input, expected: "number" })),
 * 	],
 * });
 * assertEquals(formatIssue(issue), "Invalid input: no union branch matched");
 * ```
 */
export function InvalidUnion(details: InvalidUnionDetails): SchemaIssue {
	return new SchemaIssue("InvalidUnion", details);
}

/**
 * Creates a `Custom` issue: a user-defined check failed.
 *
 * @param details The rejected input and the message
 * @returns The issue
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Custom, formatIssue } from "@sekhmet/schema/core/mini/issue";
 *
 * assertEquals(
 * 	formatIssue(Custom({ input: "bob", message: "Username is taken" })),
 * 	"Username is taken",
 * );
 * ```
 */
export function Custom(details: CustomDetails): SchemaIssue {
	return new SchemaIssue("Custom", details);
}

/**
 * Whether a value is a {@linkcode SchemaIssue}.
 *
 * @param value The value to check
 * @returns `true` if it is a `SchemaIssue`
 *
 * @example
 * ```ts
 * import { assert, assertFalse } from "@std/assert";
 * import { Custom, isSchemaIssue } from "@sekhmet/schema/core/mini/issue";
 *
 * assert(isSchemaIssue(Custom({ input: 1, message: "no" })));
 * assertFalse(isSchemaIssue(new TypeError("no")));
 * ```
 */
export function isSchemaIssue(value: unknown): value is SchemaIssue {
	return value instanceof SchemaIssue;
}

/** Renders a value the way a message quotes it. */
function formatValue(value: unknown): string {
	switch (typeof value) {
		case "string":
			return JSON.stringify(value);
		case "bigint":
			return `${value}n`;
		case "symbol":
			return value.toString();
		case "object":
			return value instanceof Date ? value.toISOString() : String(value);
		default:
			return String(value);
	}
}

const COUNTED: Partial<Record<Origin, string>> = {
	string: "characters",
	array: "items",
	set: "items",
	map: "entries",
};

function formatBound({
	origin,
	comparison,
	limit,
}: {
	origin: Origin;
	comparison: string;
	limit: unknown;
}): string {
	const unit = COUNTED[origin];

	return unit === undefined
		? `${origin} to be ${comparison} ${formatValue(limit)}`
		: `${origin} to have ${comparison} ${formatValue(limit)} ${unit}`;
}

/**
 * Renders a default English message for a {@linkcode SchemaIssue}. The
 * message describes the issue alone; its location (an {@linkcode Issues}
 * path) is the caller's to add.
 *
 * @param issue The issue to describe
 * @returns The message
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { formatIssue, TooSmall } from "@sekhmet/schema/core/mini/issue";
 *
 * const issue = TooSmall({ input: [], origin: "array", minimum: 1, inclusive: true });
 * assertEquals(formatIssue(issue), "Too small: expected array to have >= 1 items");
 * ```
 */
export function formatIssue(issue: SchemaIssue): string {
	return match(issue)({
		InvalidType: ({ expected, received }) =>
			`Expected ${expected}, received ${received}`,
		InvalidValue: ({ expected }) =>
			expected.length === 1
				? `Expected ${formatValue(expected[0])}`
				: `Expected one of ${expected.map(formatValue).join(", ")}`,
		InvalidFormat: ({ format, pattern }) =>
			pattern === undefined
				? `Invalid ${format}`
				: `Invalid ${format}: must match ${pattern}`,
		TooSmall: ({ origin, minimum, inclusive }) =>
			`Too small: expected ${formatBound({ origin, comparison: inclusive ? ">=" : ">", limit: minimum })}`,
		TooBig: ({ origin, maximum, inclusive }) =>
			`Too big: expected ${formatBound({ origin, comparison: inclusive ? "<=" : "<", limit: maximum })}`,
		NotMultipleOf: ({ divisor }) =>
			`Expected a multiple of ${formatValue(divisor)}`,
		UnknownKey: ({ key }) => `Unknown key ${formatValue(key)}`,
		InvalidUnion: () => "Invalid input: no union branch matched",
		Custom: ({ message }) => message,
	});
}
