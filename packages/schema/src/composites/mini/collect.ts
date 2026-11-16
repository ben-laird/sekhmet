/**
 * The machinery every composite shares: run each child's parse, settle them
 * together (`Sync` when every child was), and collect every failure with its
 * path. Internal: not exported from the mini barrel.
 *
 * Composites build their typed public signatures as overloads over an erased
 * implementation that works on {@linkcode Child} schemas, the same way
 * `toIssues` and `locate` do. A child only ever receives the part of the
 * composite's input its own `Input` describes, so the erasure is sound.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { getStructParams } from "@sekhmet/primordials/struct";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import {
	concat,
	fromError,
	type Issues,
	locate,
} from "@/src/core/mini/issues.ts";
import {
	Async,
	type MaybePromise,
	map as mapPotential,
	type Potential,
	Sync,
} from "@/src/core/mini/potential.ts";
import { parse, Schema } from "@/src/core/mini/schema.ts";

/** A child schema with its type parameters erased. */
export type Child = Schema<unknown, unknown, unknown>;

/** What an erased composite parser returns. */
export type Parsed = MaybePromise<Result<unknown, Issues<unknown>>>;

/** What an erased child's parser returns. */
export type ChildParsed = MaybePromise<Result<unknown, unknown>>;

/** A value modifier that lets a schema accept one more value. */
type Modifier = "optional" | "nullable";

/**
 * The schema each modifier's result wraps, keyed by its parser (which a
 * main schema shares with its mini form), so `object` can see past them.
 */
const WRAPPED: WeakMap<object, { modifier: Modifier; inner: Child }> =
	new WeakMap();

/** A modifier's schema, recorded as wrapping `inner`. */
export function wrap({
	modifier,
	inner,
	parser,
}: {
	modifier: Modifier;
	inner: Child;
	parser: (input: unknown) => ChildParsed;
}): Child {
	WRAPPED.set(parser, { modifier, inner });

	return new Schema({ parse: parser });
}

/** `nullable`'s erased implementation: `null` passes, anything else is parsed. */
export function acceptNull(inner: Child): Child {
	const parser = getStructParams(inner).parse;

	return wrap({
		modifier: "nullable",
		inner,
		parser: (input): ChildParsed => (input === null ? Ok(null) : parser(input)),
	});
}

/**
 * A schema without its `optional` modifiers, through any `nullable` ones:
 * what a missing required key is parsed with, so a value-optional field
 * still reports its inner schema's issue for a missing key.
 */
export function withoutOptional(schema: Child): Child {
	const wrapped = WRAPPED.get(getStructParams(schema).parse);
	if (wrapped === undefined) return schema;

	const inner = withoutOptional(wrapped.inner);

	return wrapped.modifier === "optional" ? inner : acceptNull(inner);
}

/** A child's parse result, found under `key`. */
export interface Settled {
	/** The key the child was found under. */
	readonly key: PropertyKey;
	/** The child's result. */
	readonly result: Result<unknown, unknown>;
}

/** A child's (possibly pending) parse, found under `key`. */
export interface Pending {
	/** The key the child was found under. */
	readonly key: PropertyKey;
	/** The child's parse. */
	readonly parsed: Potential<Result<unknown, unknown>>;
}

/** Starts a child's parse of `value`, found under `key`. */
export function run<I>({
	key,
	child,
	value,
}: {
	key: PropertyKey;
	child: Schema<I, unknown, unknown>;
	value: I;
}): Pending {
	return { key, parsed: parse(child, value) };
}

function toPromise<T>(potential: Potential<T>): Promise<T> {
	return match(potential)({
		Sync: (value) => Promise.resolve(value),
		Async: (promise) => promise,
	});
}

/**
 * Settles every child: `Sync` when every child's parse was, otherwise
 * `Async`, awaiting them all (they already run concurrently).
 */
export function settle(pending: readonly Pending[]): Potential<Settled[]> {
	const settled: Settled[] = [];
	for (const { key, parsed } of pending) {
		const result = match(parsed)({
			Sync: (value): Result<unknown, unknown> | undefined => value,
			Async: () => undefined,
		});
		if (result === undefined) {
			return Async(
				Promise.all(
					pending.map(async ({ key, parsed }) => ({
						key,
						result: await toPromise(parsed),
					})),
				),
			);
		}
		settled.push({ key, result });
	}

	return Sync(settled);
}

/**
 * Collects the children's outputs, or every failure: each child's error
 * located under its key, then `extra` (issues the composite found itself).
 */
export function gather({
	settled,
	extra,
}: {
	settled: readonly Settled[];
	extra: Issues<unknown> | undefined;
}): Result<[PropertyKey, unknown][], Issues<unknown>> {
	const outputs: [PropertyKey, unknown][] = [];
	const failures: Issues<unknown>[] = [];

	for (const { key, result } of settled) {
		match(result)({
			Ok: (output) => {
				outputs.push([key, output]);
			},
			Err: (error) => {
				failures.push(locate({ key, error }));
			},
		});
	}
	if (extra !== undefined) failures.push(extra);

	const [first, ...rest] = failures;

	return first === undefined ? Ok(outputs) : Err(concat([first, ...rest]));
}

/**
 * Runs the children, settles them, and builds the composite's output from
 * theirs, or fails with every issue.
 */
export function compose({
	pending,
	extra,
	build,
}: {
	pending: readonly Pending[];
	extra: Issues<unknown> | undefined;
	build: (outputs: [PropertyKey, unknown][]) => unknown;
}): Parsed {
	return union(
		mapPotential(settle(pending), (settled) =>
			match(gather({ settled, extra }))({
				Ok: (outputs): Result<unknown, Issues<unknown>> => Ok(build(outputs)),
				Err: (issues) => Err(issues),
			}),
		),
	);
}

/** Fails at the root with an `InvalidType` issue. */
export function invalidType({
	input,
	expected,
}: {
	input: unknown;
	expected: string;
}): Result<never, Issues<SchemaIssue>> {
	return Err(fromError(InvalidType({ input, expected })));
}

/** Whether a value is a non-array object whose keys can be read. */
export function isRecord(
	value: unknown,
): value is Readonly<Record<PropertyKey, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is an array. */
export function isArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}
