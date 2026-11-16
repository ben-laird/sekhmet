import { getStructParams, Struct } from "@sekhmet/primordials/struct";

/**
 * A read-only array with at least one element.
 *
 * @template T The element type
 */
export type NonEmpty<T> = readonly [T, ...T[]];

/**
 * An error located in a value: `path` leads from the root of the value a
 * composite schema parsed to the part that failed with `error`.
 *
 * @template E The error type
 */
export interface Located<E> {
	/** The keys from the root to the failing part; empty for the root itself. */
	readonly path: readonly PropertyKey[];
	/** The failing part's error. */
	readonly error: E;
}

/**
 * A non-empty collection of {@linkcode Located} errors: how a composite
 * schema reports every failure, not just the first.
 *
 * `Issues` is a class so a composite can recognise a child's `Issues` at
 * runtime ({@linkcode isIssues}) and flatten it into its own
 * ({@linkcode locate}), rather than nesting one inside another.
 *
 * @template E The error type of each entry
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { concat, entries, fromError, prefix } from "@sekhmet/schema/core/mini/issues";
 *
 * const issues = concat(
 * 	prefix(fromError("required"), "name"),
 * 	prefix(fromError("too short"), "password"),
 * );
 *
 * assertEquals(entries(issues), [
 * 	{ path: ["name"], error: "required" },
 * 	{ path: ["password"], error: "too short" },
 * ]);
 * ```
 */
export class Issues<out E> extends Struct<NonEmpty<Located<E>>> {}

/**
 * Collects a single error at the empty path (the root).
 *
 * @template E The error type
 * @param error The error
 * @returns `Issues` holding just `error`, at the root
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { entries, fromError } from "@sekhmet/schema/core/mini/issues";
 *
 * assertEquals(entries(fromError("invalid")), [{ path: [], error: "invalid" }]);
 * ```
 */
export function fromError<E>(error: E): Issues<E> {
	return new Issues([{ path: [], error }]);
}

/**
 * Reads the located errors of an `Issues`, in order.
 *
 * @template E The error type
 * @param self The issues to read
 * @returns The non-empty list of located errors
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { entries, fromError, prefix } from "@sekhmet/schema/core/mini/issues";
 *
 * const [first] = entries(prefix(fromError("invalid"), 0));
 * assertEquals(first.path, [0]);
 * ```
 */
export function entries<E>(self: Issues<E>): NonEmpty<Located<E>> {
	return getStructParams(self);
}

/**
 * Moves every error one level down: prepends `key` to each path. A composite
 * prefixes a child's issues with the key it found the child under.
 *
 * @template E The error type
 * @param self The issues to prefix
 * @param key The path segment to prepend
 * @returns New issues with `key` in front of every path
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { entries, fromError, prefix } from "@sekhmet/schema/core/mini/issues";
 *
 * const issues = prefix(prefix(fromError("invalid"), "street"), "address");
 * assertEquals(entries(issues), [{ path: ["address", "street"], error: "invalid" }]);
 * ```
 */
export function prefix<E>(self: Issues<E>, key: PropertyKey): Issues<E> {
	const under = ({ path, error }: Located<E>): Located<E> => ({
		path: [key, ...path],
		error,
	});
	const [first, ...rest] = entries(self);

	return new Issues([under(first), ...rest.map(under)]);
}

/**
 * Joins two `Issues`, `self`'s entries first. `concat` is associative.
 *
 * @template E The first issues' error type
 * @template F The second issues' error type
 * @param self The first issues
 * @param other The issues to append
 * @returns Issues holding both lists of entries
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { concat, entries, fromError } from "@sekhmet/schema/core/mini/issues";
 *
 * const issues = concat(fromError("a"), fromError(1));
 * assertEquals(entries(issues).map(({ error }) => error), ["a", 1]);
 * ```
 */
export function concat<E, F>(self: Issues<E>, other: Issues<F>): Issues<E | F> {
	const [first, ...rest] = entries(self);

	return new Issues<E | F>([first, ...rest, ...entries(other)]);
}

/**
 * Whether a value is an {@linkcode Issues}.
 *
 * @param value The value to check
 * @returns `true` if it is an `Issues`
 *
 * @example
 * ```ts
 * import { assert, assertFalse } from "@std/assert";
 * import { fromError, isIssues } from "@sekhmet/schema/core/mini/issues";
 *
 * assert(isIssues(fromError("invalid")));
 * assertFalse(isIssues("invalid"));
 * ```
 */
export function isIssues(value: unknown): value is Issues<unknown> {
	return value instanceof Issues;
}

/**
 * The error type of a child error once flattened into `Issues`: a child's
 * `Issues<F>` contributes `F`, any other error `E` contributes itself. It
 * distributes over unions, so `Flatten<E1 | Issues<E2>>` is `E1 | E2`.
 *
 * @template E A child schema's error type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { Flatten, Issues } from "@sekhmet/schema/core/mini/issues";
 *
 * assertType<IsExact<Flatten<"a" | Issues<"b">>, "a" | "b">>(true);
 * ```
 */
export type Flatten<E> = E extends Issues<infer F> ? F : E;

/**
 * Flattens a child error into `Issues` at the root: a child's `Issues` is
 * returned as it is, and any other error is collected at the empty path. A
 * union uses it to keep each branch's failure.
 *
 * @template E The child's error type
 * @param error The child's error
 * @returns The error as `Issues`, never nested
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { entries, fromError, toIssues } from "@sekhmet/schema/core/mini/issues";
 *
 * assertEquals(entries(toIssues("invalid")), [{ path: [], error: "invalid" }]);
 * assertEquals(entries(toIssues(fromError("invalid"))), [{ path: [], error: "invalid" }]);
 * ```
 */
export function toIssues<E>(error: E): Issues<Flatten<E>>;
export function toIssues(error: unknown): Issues<unknown> {
	return isIssues(error) ? error : fromError(error);
}

/**
 * Flattens a child error into `Issues` under `key`: the composite rule. A
 * child's own `Issues` has its paths prefixed with `key`; any other error is
 * located at `[key]`. So a composite whose children fail with `E1` and
 * `Issues<E2>` fails with `Issues<E1 | E2>`.
 *
 * @template E The child's error type
 * @param located.key The key the child was found under
 * @param located.error The child's error
 * @returns The child's errors, located under `key`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import {
 * 	concat,
 * 	entries,
 * 	fromError,
 * 	locate,
 * 	prefix,
 * } from "@sekhmet/schema/core/mini/issues";
 *
 * const nameError = "required";
 * const addressErrors = prefix(fromError("invalid"), "street");
 * const issues = concat(
 * 	locate({ key: "name", error: nameError }),
 * 	locate({ key: "address", error: addressErrors }),
 * );
 *
 * assertEquals(entries(issues), [
 * 	{ path: ["name"], error: "required" },
 * 	{ path: ["address", "street"], error: "invalid" },
 * ]);
 * ```
 */
export function locate<E>(located: {
	key: PropertyKey;
	error: E;
}): Issues<Flatten<E>>;
export function locate(located: {
	key: PropertyKey;
	error: unknown;
}): Issues<unknown> {
	return prefix(toIssues(located.error), located.key);
}
