/**
 * Type guards from schemas: {@linkcode is} turns a schema into a curried
 * predicate that narrows its input when the schema parses it.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { parseSync, type Schema } from "./schema.ts";

/**
 * Turns a schema into a type guard: `is(schema)(input)` is `true` when
 * `schema` parses `input` successfully, narrowing `input` to `O & I`. Curried,
 * so the guard feeds `Array.prototype.filter`, an `if`, or a
 * `filter({ predicate })`.
 *
 * **Sound only for schemas that don't transform**, whose output is the input
 * itself (output ⊆ input); TypeScript can't express that constraint. The
 * guard reports that the schema accepted `input`, then claims `input` is the
 * _output_. A transforming schema breaks that claim:
 *
 * - `string({ trim: true })` accepts `" a "` because its trimmed output
 *   `"a"` passes, so a check on the output (a length, a brand) says nothing
 *   about `input`.
 * - `number({ coerce: true })` accepts `"42"`, so the guard narrows a string
 *   to `number`.
 *
 * To use the output, parse instead (`parseSync`), and keep the value it
 * returns.
 *
 * The guard parses with `parseSync`. A schema that parses asynchronously
 * can't answer a synchronous guard, so it panics: using an async schema as a
 * guard is a programmer error, not a parse failure.
 *
 * @template I The input type
 * @template O The output type
 * @template E The error type
 * @param schema The schema the guard parses with; it must not transform
 * @returns A type guard narrowing its input to `O & I`
 * @throws {TypeError} A panic when `schema` parses asynchronously
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { is } from "@sekhmet/schema/core/mini";
 * import { string } from "@sekhmet/schema/primitives/mini";
 *
 * const values: unknown[] = ["a", 1, "b", null];
 * const strings: string[] = values.filter(is(string()));
 *
 * assertEquals(strings, ["a", "b"]);
 * ```
 */
export function is<I, O, E>(
	schema: Schema<I, O, E>,
): (input: I) => input is O & I {
	return (input): input is O & I => {
		return match(parseSync(schema, input))<boolean>({
			Ok: () => true,
			Err: (error) => {
				return match(error)<boolean>({
					ParseError: () => false,
					UnexpectedAsyncParse: () => {
						throw new TypeError(
							"is: the schema parsed asynchronously, but a type guard must be synchronous; use parseAsync for an async schema",
						);
					},
				});
			},
		});
	};
}
