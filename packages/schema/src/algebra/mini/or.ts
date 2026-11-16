import { union as variant } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { getStructParams } from "@sekhmet/primordials/struct";
import { union } from "@/src/composites/mini/union.ts";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Issues } from "@/src/core/mini/issues.ts";
import type { AnySchema, Schema } from "@/src/core/mini/schema.ts";

/**
 * What {@linkcode or} builds a schema from: the schema to try first, and the
 * one to try when it fails.
 *
 * @template I The left schema's input type
 * @template O The left schema's output type
 * @template E The left schema's error type
 * @template J The right schema's input type
 * @template P The right schema's output type
 * @template F The right schema's error type
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { unwrap } from "@sekhmet/enum/result/mini";
 * import { or, type OrOptions } from "@sekhmet/schema/algebra/mini";
 * import { parseSync, type SchemaIssue } from "@sekhmet/schema/core/mini";
 * import { number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const options: OrOptions<unknown, string, SchemaIssue, unknown, number, SchemaIssue> = {
 * 	left: string(),
 * 	right: number(),
 * };
 *
 * assertEquals(unwrap(parseSync(or(options), 3)), 3);
 * ```
 */
export interface OrOptions<I, O, E, J, P, F> {
	/** The schema tried first. */
	readonly left: Schema<I, O, E>;
	/** The schema tried when `left` fails. */
	readonly right: Schema<J, P, F>;
}

/**
 * The schemas `or` tries for one side: the options of an un-annotated
 * `union` (one level, as written), or the side itself. An annotated union
 * is kept whole, so its annotations still describe it.
 */
function branches(side: AnySchema): readonly [AnySchema, ...AnySchema[]] {
	const { node, annotations } = getStructParams(side);
	if (annotations.length === 0 && isolate(node, "Union")) {
		return variant(node).options;
	}

	return [side];
}

/**
 * Creates a schema that accepts what `left` or `right` accepts: sugar over
 * `union([left, right])`. `left` is tried first, and `right` only when it
 * fails; when both fail, the schema fails with one `InvalidUnion` issue at
 * the root, carrying each branch's issues in order. Both sides get the same
 * input, so the input type is the intersection of theirs, as for `union`.
 *
 * Chains flatten: a side that is an un-annotated `union` (from `union` or
 * another `or`, read from its node) contributes its options, so
 * `or({ left: or({ left: a, right: b }), right: c })` is
 * `union([a, b, c])`, with one `InvalidUnion` of three branches. A union
 * with annotations is kept whole, as one branch.
 *
 * @template I The left schema's input type
 * @template O The left schema's output type
 * @template E The left schema's error type
 * @template J The right schema's input type
 * @template P The right schema's output type
 * @template F The right schema's error type
 * @param options The schema to try first, and the one to try after it
 * @returns A schema for what either side accepts
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { union } from "@sekhmet/enum/core/mini/exit";
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { or } from "@sekhmet/schema/algebra/mini";
 * import { entries, parseAsync, parseSync } from "@sekhmet/schema/core/mini";
 * import { boolean, number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const scalar = or({ left: or({ left: string(), right: number() }), right: boolean() });
 *
 * assertEquals(unwrap(parseSync(scalar, true)), true);
 *
 * const [{ error }] = entries(unwrapErr(await parseAsync(scalar, null)));
 * const details = union(error);
 * assertEquals("branches" in details ? details.branches.length : 0, 3);
 * ```
 */
export function or<I, O, E, J, P, F>(
	options: OrOptions<I, O, E, J, P, F>,
): Schema<I & J, O | P, Issues<SchemaIssue>>;
export function or(options: {
	readonly left: AnySchema;
	readonly right: AnySchema;
}): AnySchema {
	return union([...branches(options.left), ...branches(options.right)]);
}
