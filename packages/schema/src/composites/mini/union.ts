import { match, union as unionValue } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidUnion, type SchemaIssue } from "@/src/core/mini/issue.ts";
import { fromError, type Issues, toIssues } from "@/src/core/mini/issues.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { map as mapPotential } from "@/src/core/mini/potential.ts";
import {
	type AnySchema,
	type Input,
	type Output,
	parse,
	Schema,
} from "@/src/core/mini/schema.ts";
import type { Child, Parsed } from "./collect.ts";

/**
 * The input a union schema accepts: every option is tried with the same
 * value, so it must suit them all (the intersection of their inputs).
 *
 * @template T The option schemas
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { UnionInput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Loose = UnionInput<[Schema<unknown, string, Error>, Schema<unknown, number, Error>]>;
 * type Typed = UnionInput<[Schema<string, string, Error>, Schema<unknown, number, Error>]>;
 *
 * assertType<IsExact<Loose, unknown>>(true);
 * assertType<IsExact<Typed, string>>(true);
 * ```
 */
export type UnionInput<T extends readonly AnySchema[]> = {
	[K in keyof T]: (input: Input<T[K]>) => void;
}[number] extends (input: infer I) => void
	? I
	: never;

/**
 * Creates a schema that accepts what any of `options` accepts. The options
 * are tried in order and the first that succeeds wins; later options are
 * not run. When none succeeds, the union fails with one `InvalidUnion`
 * issue at the root, carrying each option's issues in order.
 *
 * @template T The option schemas
 * @param options The schemas to try, in order
 * @returns A schema for any of `options`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { union } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const text = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "string" ? Ok(input) : Err("not text");
 * 	},
 * });
 * const count = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" ? Ok(input) : Err("not a number");
 * 	},
 * });
 * const textOrCount = union([text, count]);
 *
 * assertEquals(unwrap(parseSync(textOrCount, 3)), 3);
 *
 * const [{ error }] = entries(unwrapErr(await parseAsync(textOrCount, null)));
 * assertEquals(formatIssue(error), "Invalid input: no union branch matched");
 * ```
 */
export function union<const T extends readonly [AnySchema, ...AnySchema[]]>(
	options: T,
): Schema<UnionInput<T>, Output<T[number]>, Issues<SchemaIssue>>;
export function union(
	options: readonly [Child, ...Child[]],
): Schema<unknown, unknown, Issues<unknown>> {
	return new Schema({
		parse: (input: unknown): Parsed => {
			const attempt = ({
				index,
				failures,
			}: {
				index: number;
				failures: readonly Issues<unknown>[];
			}): Parsed => {
				const option = options[index];
				if (option === undefined) {
					return Err(fromError(InvalidUnion({ input, branches: failures })));
				}

				return unionValue(
					mapPotential(parse(option, input), (result) => {
						return match(result)({
							Ok: (output): Parsed => Ok(output),
							Err: (error) => {
								return attempt({
									index: index + 1,
									failures: [...failures, toIssues(error)],
								});
							},
						});
					}),
				);
			};

			return attempt({ index: 0, failures: [] });
		},
		node: new SchemaNode("Union", { options }),
	});
}
