import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Inspect } from "./check.ts";

/**
 * A limit on a value, for a `min` or `max` option. A bare value is
 * inclusive: `min: 0` allows `0`. `{ value, inclusive: false }` excludes the
 * value itself: `min: { value: 0, inclusive: false }` allows only values
 * above `0`.
 *
 * @template T The bounded type (`number`, `bigint` or `Date`)
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { isErr, isOk } from "@sekhmet/enum/result/mini";
 * import { parseSync } from "@sekhmet/schema/core/mini";
 * import { type Bound, number } from "@sekhmet/schema/primitives/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 *
 * const panics = definePanicRuntime();
 *
 * const above: Bound<number> = { value: 0, inclusive: false };
 * const ratio = number({ min: 0, max: { value: 1, inclusive: false } });
 *
 * assertEquals(isOk(parseSync(ratio, { input: 0, panics })), true);
 * assertEquals(isErr(parseSync(ratio, { input: 1, panics })), true);
 * assertEquals(isErr(parseSync(number({ min: above }), { input: 0, panics })), true);
 * ```
 */
export type Bound<T> =
	| T
	| {
			/** The limit. */
			readonly value: T;
			/** Whether the limit itself is allowed. */
			readonly inclusive: boolean;
	  };

/** A bound with its inclusivity spelled out. */
export interface Limit<T> {
	/** The limit. */
	readonly value: T;
	/** Whether the limit itself is allowed. */
	readonly inclusive: boolean;
}

/** Spells out a bound's inclusivity: a bare value is inclusive. */
export function limitOf<T>({
	bound,
	isValue,
}: {
	bound: Bound<T>;
	isValue: (bound: Bound<T>) => bound is T;
}): Limit<T> {
	return isValue(bound) ? { value: bound, inclusive: true } : bound;
}

/** What a bound check compares: a number, bigint or date's magnitude. */
export type Measure<T> = (value: T) => number | bigint;

/**
 * Fails a value below `limit` (or at it, when exclusive) with the issue
 * `tooSmall` builds.
 */
export function atLeast<T>({
	limit,
	measure,
	tooSmall,
}: {
	limit: Limit<T>;
	measure: Measure<T>;
	tooSmall: (input: T) => SchemaIssue;
}): Inspect<T> {
	const bound = measure(limit.value);

	return (value) => {
		const size = measure(value);
		const within = limit.inclusive ? size >= bound : size > bound;

		return within ? undefined : tooSmall(value);
	};
}

/**
 * Fails a value above `limit` (or at it, when exclusive) with the issue
 * `tooBig` builds.
 */
export function atMost<T>({
	limit,
	measure,
	tooBig,
}: {
	limit: Limit<T>;
	measure: Measure<T>;
	tooBig: (input: T) => SchemaIssue;
}): Inspect<T> {
	const bound = measure(limit.value);

	return (value) => {
		const size = measure(value);
		const within = limit.inclusive ? size <= bound : size < bound;

		return within ? undefined : tooBig(value);
	};
}
