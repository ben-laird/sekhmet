import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Flatten, Issues } from "@/src/core/mini/issues.ts";
import { Schema } from "@/src/core/mini/schema.ts";
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
 * @param key The schema for each key
 * @param value The schema for each value
 * @returns A schema for records of `key` to `value`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
 * import { record } from "@sekhmet/schema/composites/mini";
 * import { parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const name = new Schema((input: string) => Ok(input));
 * const score = new Schema((input: unknown) =>
 * 	typeof input === "number" ? Ok(input) : Err("not a score"),
 * );
 *
 * assertEquals(unwrap(parseSync(record(name, score), { ada: 3 })), { ada: 3 });
 * ```
 */
export function record<KO extends PropertyKey, KE, VI, VO, VE>(
	key: Schema<string, KO, KE>,
	value: Schema<VI, VO, VE>,
): Schema<
	RecordInput<VI>,
	RecordOutput<KO, VO>,
	Issues<Flatten<KE | VE> | SchemaIssue>
>;
export function record(
	key: Schema<string, PropertyKey, unknown>,
	value: Child,
): Schema<unknown, unknown, Issues<unknown>> {
	return new Schema((input: unknown): Parsed => {
		if (!isRecord(input)) return invalidType({ input, expected: "object" });

		// Each key's own parse, then its value's: issues stay in key order.
		const pending = Object.keys(input).flatMap((name) => [
			run({ key: name, child: key, value: name }),
			run({ key: name, child: value, value: input[name] }),
		]);

		return compose({
			pending,
			extra: undefined,
			build: (outputs) =>
				Object.fromEntries(
					outputs.flatMap(([, outputKey], index) =>
						index % 2 === 0 ? [[outputKey, outputs[index + 1]?.[1]]] : [],
					),
				),
		});
	});
}
