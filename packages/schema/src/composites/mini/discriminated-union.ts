import { match, union } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { InvalidValue, type SchemaIssue } from "@/src/core/mini/issue.ts";
import {
	type Flatten,
	type Issues,
	locate,
	toIssues,
} from "@/src/core/mini/issues.ts";
import { SchemaNode } from "@/src/core/mini/node.ts";
import { map as mapPotential } from "@/src/core/mini/potential.ts";
import {
	type ErrorOf,
	type Input,
	type Output,
	parse,
	type Schema,
} from "@/src/core/mini/schema.ts";
import { viewed } from "@/src/core/mini/view.ts";
import { type Child, invalidType, isRecord, type Parsed } from "./collect.ts";

/**
 * A discriminated union's options: each discriminant value's schema, which
 * parses an object carrying that value.
 *
 * @example
 * ```ts
 * import type { Options } from "@sekhmet/schema/composites/mini";
 * import { object } from "@sekhmet/schema/composites/mini";
 *
 * const shapes: Options = {
 * 	circle: object({ shape: {} }),
 * 	square: object({ shape: {} }),
 * };
 * ```
 */
export type Options = {
	readonly [value: string]: Schema<never, object, unknown>;
};

/**
 * The input a discriminated union accepts: `unknown` when every option
 * accepts anything, and otherwise each option's input carrying its
 * discriminant.
 *
 * @template K The discriminant key
 * @template M The options
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { DiscriminatedInput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Loose = DiscriminatedInput<"kind", { a: Schema<unknown, { x: 1 }, Error> }>;
 * assertType<IsExact<Loose, unknown>>(true);
 * ```
 */
export type DiscriminatedInput<K extends string, M extends Options> = [
	{
		[V in keyof M]-?: unknown extends Input<M[V]> ? never : V;
	}[keyof M],
] extends [never]
	? unknown
	: {
			[V in keyof M & string]: Input<M[V]> & {
				readonly [P in K]: V;
			} extends infer Flat
				? { [P in keyof Flat]: Flat[P] }
				: never;
		}[keyof M & string];

/**
 * The output of a discriminated union: each option's output, carrying its
 * discriminant, so a `switch` on the key narrows it.
 *
 * @template K The discriminant key
 * @template M The options
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { DiscriminatedOutput } from "@sekhmet/schema/composites/mini";
 * import type { Schema } from "@sekhmet/schema/core/mini";
 *
 * type Shape = DiscriminatedOutput<"kind", {
 * 	circle: Schema<unknown, { radius: number }, Error>;
 * 	square: Schema<unknown, { side: number }, Error>;
 * }>;
 * assertType<IsExact<
 * 	Shape,
 * 	{ radius: number; kind: "circle" } | { side: number; kind: "square" }
 * >>(true);
 * ```
 */
export type DiscriminatedOutput<K extends string, M extends Options> = {
	[V in keyof M & string]: Output<M[V]> & {
		[P in K]: V;
	} extends infer Flat
		? { [P in keyof Flat]: Flat[P] }
		: never;
}[keyof M & string];

/**
 * What {@linkcode discriminatedUnion} builds a schema from: the key holding
 * the discriminant, and each discriminant value's schema.
 *
 * @template K The discriminant key
 * @template M The options
 *
 * @example
 * ```ts
 * import {
 * 	type DiscriminatedUnionOptions,
 * 	object,
 * } from "@sekhmet/schema/composites/mini";
 *
 * const circle = object({ shape: {} });
 * const shapes: DiscriminatedUnionOptions<"kind", { circle: typeof circle }> = {
 * 	key: "kind",
 * 	options: { circle },
 * };
 * ```
 */
export interface DiscriminatedUnionOptions<
	K extends string,
	M extends Options,
> {
	/** The key holding the discriminant. */
	readonly key: K;
	/** Each discriminant value's schema, which parses an object carrying it. */
	readonly options: M;
}

/**
 * A view of a discriminated union's key and options, as passed: each
 * option's schema keeps its type (`shape.options.circle`).
 *
 * @template K The discriminant key
 * @template M The options
 *
 * @example
 * ```ts
 * import { assertStrictEquals } from "@std/assert";
 * import { discriminatedUnion, object } from "@sekhmet/schema/composites/mini";
 * import { number } from "@sekhmet/schema/primitives/mini";
 *
 * const circle = object({ shape: { radius: number() } });
 * const shape = discriminatedUnion({ key: "kind", options: { circle } });
 *
 * assertStrictEquals(shape.key, "kind");
 * assertStrictEquals(shape.options.circle, circle);
 * ```
 */
export interface DiscriminatedUnionView<K extends string, M> {
	/** The key holding the discriminant, as passed. */
	readonly key: K;
	/** Each discriminant value's schema, as passed. */
	readonly options: M;
}

/**
 * Creates a schema for a union of objects told apart by the string under
 * `key`: the value there picks the option that parses the whole object.
 * The output carries the discriminant, whether or not the option declares
 * it.
 *
 * A non-object input fails with an `InvalidType` issue at the root; a
 * discriminant that names no option fails with an `InvalidValue` issue at
 * `[key]`, listing the options' values. The chosen option's issues are
 * reported as it found them.
 *
 * The result's view (`.key`, `.options`) is the declaration's, as passed.
 *
 * @template K The discriminant key
 * @template M The options
 * @param declaration The key holding the discriminant, and each discriminant
 *   value's schema
 * @returns A schema for the union of `options`, viewing `key` and `options`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok, unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { discriminatedUnion, object } from "@sekhmet/schema/composites/mini";
 * import { entries, formatIssue, parseAsync, parseSync, Schema } from "@sekhmet/schema/core/mini";
 *
 * const size = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" ? Ok(input) : Err("not a size");
 * 	},
 * });
 * const shape = discriminatedUnion({
 * 	key: "kind",
 * 	options: {
 * 		circle: object({ shape: { radius: size } }),
 * 		square: object({ shape: { side: size } }),
 * 	},
 * });
 *
 * assertEquals(unwrap(parseSync(shape, { kind: "circle", radius: 2 })), {
 * 	radius: 2,
 * 	kind: "circle",
 * });
 *
 * const [issue] = entries(unwrapErr(await parseAsync(shape, { kind: "star" })));
 * assertEquals(issue.path, ["kind"]);
 * ```
 */
export function discriminatedUnion<const K extends string, M extends Options>(
	declaration: DiscriminatedUnionOptions<K, M>,
): Schema<
	DiscriminatedInput<K, M>,
	DiscriminatedOutput<K, M>,
	Issues<Flatten<ErrorOf<M[keyof M]>> | SchemaIssue>
> &
	DiscriminatedUnionView<K, M>;
export function discriminatedUnion(declaration: {
	readonly key: string;
	readonly options: Readonly<Record<string, Child>>;
}): Schema<unknown, unknown, Issues<unknown>> &
	DiscriminatedUnionView<string, Readonly<Record<string, Child>>> {
	const { key, options } = declaration;

	return viewed({
		init: {
			parse: (input: unknown): Parsed => {
				if (!isRecord(input)) return invalidType({ input, expected: "object" });

				const value = input[key];
				const known =
					typeof value === "string" && Object.hasOwn(options, value);
				const option = known ? options[value] : undefined;
				if (typeof value !== "string" || option === undefined) {
					return Err(
						locate({
							key,
							error: InvalidValue({
								input: value,
								expected: Object.keys(options),
							}),
						}),
					);
				}

				return union(
					mapPotential(parse(option, input), (result) => {
						return match(result)({
							Ok: (output): Parsed => {
								if (!isRecord(output)) return Ok(output);

								return Ok({ ...output, [key]: value });
							},
							Err: (error) => Err(toIssues(error)),
						});
					}),
				);
			},
			node: new SchemaNode("DiscriminatedUnion", { key, options }),
		},
		view: { key, options },
	});
}
