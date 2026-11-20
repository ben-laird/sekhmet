/**
 * The record composite: {@linkcode record} builds a schema for objects used as
 * dictionaries, parsing every key with one schema and every value with
 * another, with its {@linkcode RecordOptions}, {@linkcode RecordInput} and
 * {@linkcode RecordOutput} types and {@linkcode RecordView}.
 *
 * @module
 */

import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Flatten, Issues } from "@/src/core/mini/issues.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import type { ParseOptions, Schema } from "@/src/core/mini/schema.ts";
import { viewed } from "@/src/core/mini/view.ts";
import {
	type Child,
	compose,
	invalidType,
	isRecord,
	type Parsed,
	run,
} from "./collect.ts";

/**
 * The input a record schema accepts: `unknown` when its value schema
 * accepts anything, and otherwise a record of the value's input.
 *
 * @template V The value schema's input type
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { RecordInput } from "@sekhmet/schema/composites/mini";
 *
 * assertType<IsExact<RecordInput<unknown>, unknown>>(true);
 * assertType<IsExact<RecordInput<number>, Readonly<Record<string, number>>>>(true);
 * ```
 */
export type RecordInput<V> = unknown extends V
	? unknown
	: Readonly<Record<string, V>>;

/**
 * The output of a record schema: a `Record` from the key schema's output to
 * the value schema's. With finite keys (a union of literals) every key is
 * optional, since the input need not have them all.
 *
 * @template K The key schema's output
 * @template V The value schema's output
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { RecordOutput } from "@sekhmet/schema/composites/mini";
 *
 * assertType<IsExact<RecordOutput<string, number>, Record<string, number>>>(true);
 * assertType<IsExact<RecordOutput<"a" | "b", number>, { a?: number; b?: number }>>(true);
 * ```
 */
export type RecordOutput<K extends PropertyKey, V> = string extends K
	? Record<K, V>
	: Partial<Record<K, V>>;

/**
 * What {@linkcode record} builds a schema from: the schema for each key and
 * the schema for each value.
 *
 * @template KO The key schema's output type
 * @template KE The key schema's error type
 * @template VI The value schema's input type
 * @template VO The value schema's output type
 * @template VE The value schema's error type
 * @template K The key schema, exactly (with its own view)
 * @template V The value schema, exactly (with its own view)
 *
 * @example
 * ```ts
 * import { Ok } from "@sekhmet/enum/result/mini";
 * import type { RecordOptions } from "@sekhmet/schema/composites/mini";
 * import { Schema } from "@sekhmet/schema/core/mini";
 *
 * const options: RecordOptions<string, never, unknown, unknown, never> = {
 * 	key: new Schema({ parse: (input: string) => Ok(input) }),
 * 	value: new Schema({ parse: (input: unknown) => Ok(input) }),
 * };
 * ```
 */
export interface RecordOptions<
	KO extends PropertyKey,
	KE,
	VI,
	VO,
	VE,
	K extends Schema<string, KO, KE> = Schema<string, KO, KE>,
	V extends Schema<VI, VO, VE> = Schema<VI, VO, VE>,
> {
	/** The schema each own enumerable string key is parsed by. */
	readonly key: K & Schema<string, KO, KE>;
	/** The schema each key's value is parsed by. */
	readonly value: V & Schema<VI, VO, VE>;
}

/**
 * A view of a record schema's key and value schemas, as passed.
 *
 * @template K The key schema
 * @template V The value schema
 *
 * @example
 * ```ts
 * import { assertStrictEquals } from "@std/assert";
 * import { record } from "@sekhmet/schema/composites/mini";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const name = string();
 * const score = number();
 * const scores = record({ key: name, value: score });
 *
 * assertStrictEquals(scores.key, name);
 * assertStrictEquals(scores.value, score);
 * ```
 */
export interface RecordView<K, V> {
	/** The schema each key is parsed by, as passed. */
	readonly key: K;
	/** The schema each value is parsed by, as passed. */
	readonly value: V;
}

/**
 * Creates a schema for objects used as dictionaries: every own enumerable
 * string key is parsed by `key`, and its value by `value`. The output maps
 * each parsed key to its parsed value; every failing key or value is
 * reported at that key's path. A non-object input (including `null` and
 * arrays) fails with an `InvalidType` issue at the root.
 *
 * @template KO The key schema's output type
 * @template KE The key schema's error type
 * @template VI The value schema's input type
 * @template VO The value schema's output type
 * @template VE The value schema's error type
 * @template K The key schema, exactly (with its own view)
 * @template V The value schema, exactly (with its own view)
 * @param options The schema for each key and for each value
 * @returns A schema for records of `key` to `value`, viewing both
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { record } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const name = new Schema({ parse: (input: string) => Ok(input) });
 * const score = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" ? Ok(input) : Err("not a score");
 * 	},
 * });
 * const scores = record({ key: name, value: score });
 *
 * assertEquals(unwrap(parseSync(scores, { ada: 3 })), { ada: 3 });
 * ```
 */
export function record<
	KO extends PropertyKey,
	KE,
	VI,
	VO,
	VE,
	K extends Schema<string, KO, KE>,
	V extends Schema<VI, VO, VE>,
>(
	options: RecordOptions<KO, KE, VI, VO, VE, K, V>,
): Schema<
	RecordInput<VI>,
	RecordOutput<KO, VO>,
	Issues<Flatten<KE | VE> | SchemaIssue>
> &
	RecordView<K, V>;
export function record(options: {
	readonly key: Schema<string, PropertyKey, unknown>;
	readonly value: Child;
}): Schema<unknown, unknown, Issues<unknown>> &
	RecordView<Schema<string, PropertyKey, unknown>, Child> {
	const { key, value } = options;

	return viewed({
		init: {
			run: ({ input, panics }: ParseOptions<unknown>): Parsed => {
				if (!isRecord(input)) return invalidType({ input, expected: "object" });

				// Each key's own parse, then its value's: issues stay in key order.
				const pending = Object.keys(input).flatMap((name) => [
					run({ key: name, child: key, value: name, panics }),
					run({ key: name, child: value, value: input[name], panics }),
				]);

				return compose({
					pending,
					extra: undefined,
					build: (outputs) => {
						return Object.fromEntries(
							outputs.flatMap(([, outputKey], index) => {
								if (index % 2 !== 0) return [];

								return [[outputKey, outputs[index + 1]?.[1]]];
							}),
						);
					},
				});
			},
			node: new SchemaNode("Record", { key, value }),
		},
		view: { key, value },
	});
}
