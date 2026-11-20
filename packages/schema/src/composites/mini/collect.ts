/**
 * The machinery every composite shares: run each child's parse, settle them
 * together (synchronously when every child was), and collect every failure
 * with its path, or the first panic. Internal: not exported from the mini
 * barrel.
 *
 * Composites build their typed public signatures as overloads over an erased
 * implementation that works on {@linkcode Child} schemas, the same way
 * `toIssues` and `locate` do. A child only ever receives the part of the
 * composite's input its own `Input` describes, so the erasure is sound.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import {
	type Outcome,
	Err as OutcomeErr,
	Ok as OutcomeOk,
	Panicked,
} from "@sekhmet/panic/outcome/mini/core";
import { map as mapOutcome } from "@sekhmet/panic/outcome/mini/transform";
import type { Vow } from "@sekhmet/vow/mini/core";
import { all, map } from "@sekhmet/vow/mini/impl";
import { InvalidType, type SchemaIssue } from "@/src/core/mini/issue.ts";
import {
	concat,
	fromError,
	type Issues,
	locate,
} from "@/src/core/mini/issues.ts";
import { nodeOf, SchemaNode } from "@/src/core/mini/node.ts";
import { type Parsing, settled } from "@/src/core/mini/parsing.ts";
import {
	type PanicBoundary,
	type ParseOptions,
	parse,
	Schema,
} from "@/src/core/mini/schema.ts";

/** A child schema with its type parameters erased. */
export type Child = Schema<unknown, unknown, unknown>;

/** What an erased composite's run returns. */
export type Parsed = Parsing<unknown, Issues<unknown>>;

/** What an erased child's run returns. */
export type ChildParsed = Parsing<unknown, unknown>;

/**
 * `nullable`'s erased implementation: `null` passes, anything else is
 * parsed by `inner`. Recorded as a `Nullable` node over `inner`.
 *
 * Typed as an overload over the erased implementation, as the composites
 * are: `withoutOptional` reads `inner` back from a node, where it is any
 * schema, and runs it as a {@linkcode Child}.
 */
export function acceptNull<I, O, E>(inner: Schema<I, O, E>): Child;
export function acceptNull(inner: Child): Child {
	return new Schema({
		run: (options: ParseOptions<unknown>): ChildParsed => {
			if (options.input === null) return settled(Ok(null));

			return parse(inner, options);
		},
		node: new SchemaNode("Nullable", { inner }),
	});
}

/**
 * A schema without its `optional` modifiers, through any `nullable` ones:
 * what a missing required key is parsed with, so a value-optional field
 * still reports its inner schema's issue for a missing key. It reads the
 * `Optional` and `Nullable` nodes, and sees through nothing else (not
 * `Readonly`, a transform or `lazy`).
 *
 * Typed as an overload over the erased implementation, as the composites
 * are: a node holds its inner schema as any schema, and the object parses
 * it with `undefined` as a {@linkcode Child}, as it did the field.
 */
export function withoutOptional<I, O, E>(schema: Schema<I, O, E>): Child;
export function withoutOptional(schema: Child): Child {
	const node = nodeOf(schema);
	if (isolate(node, "Optional")) return withoutOptional(union(node).inner);
	if (isolate(node, "Nullable")) {
		return acceptNull(withoutOptional(union(node).inner));
	}

	return schema;
}

/** A child's settled parse, found under `key`. */
export interface Settled {
	/** The key the child was found under. */
	readonly key: PropertyKey;
	/** The child's outcome. */
	readonly outcome: Outcome<unknown, unknown, unknown>;
}

/** A child's (possibly pending) parse, found under `key`. */
export interface Pending {
	/** The key the child was found under. */
	readonly key: PropertyKey;
	/** The child's parse. */
	readonly parsed: ChildParsed;
}

/** Starts a child's parse of `value`, found under `key`, under `panics`. */
export function run<I>({
	key,
	child,
	value,
	panics,
}: {
	key: PropertyKey;
	child: Schema<I, unknown, unknown>;
	value: I;
	panics: PanicBoundary;
}): Pending {
	return { key, parsed: parse(child, { input: value, panics }) };
}

/**
 * Settles every child: synchronously when every child's parse was,
 * otherwise once the last one does (they already run concurrently).
 */
export function settle(pending: readonly Pending[]): Vow<Settled[]> {
	return all(
		pending.map(({ key, parsed }) => {
			return map(parsed, (outcome): Settled => ({ key, outcome }));
		}),
	);
}

/**
 * Collects the children's outputs, or every failure: each child's error
 * located under its key, then `extra` (issues the composite found itself).
 * A child that panicked panics the composite: the first such, by key order.
 */
export function gather({
	settled,
	extra,
}: {
	settled: readonly Settled[];
	extra: Issues<unknown> | undefined;
}): Outcome<[PropertyKey, unknown][], Issues<unknown>, unknown> {
	const outputs: [PropertyKey, unknown][] = [];
	const failures: Issues<unknown>[] = [];

	for (const { key, outcome } of settled) {
		const panic = match(outcome)<{ payload: unknown } | undefined>({
			Ok: (output) => {
				outputs.push([key, output]);
				return undefined;
			},
			Err: (error) => {
				failures.push(locate({ key, error }));
				return undefined;
			},
			Panicked: (payload) => ({ payload }),
		});
		if (panic !== undefined) return Panicked(panic.payload);
	}
	if (extra !== undefined) failures.push(extra);

	const [first, ...rest] = failures;
	if (first === undefined) return OutcomeOk(outputs);

	return OutcomeErr(concat([first, ...rest]));
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
	return map(settle(pending), (settled) => {
		return mapOutcome(gather({ settled, extra }), build);
	});
}

/** Fails at the root with an `InvalidType` issue. */
export function invalidType({
	input,
	expected,
}: {
	input: unknown;
	expected: string;
}): Parsed {
	return settled<unknown, Issues<SchemaIssue>>(
		Err(fromError(InvalidType({ input, expected }))),
	);
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
