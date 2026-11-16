import { branchesOf, type Child } from "@/src/composites/mini/collect.ts";
import { union } from "@/src/composites/mini/union.ts";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import type { Issues } from "@/src/core/mini/issues.ts";
import type { Schema } from "@/src/core/mini/schema.ts";

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
 * Creates a schema that accepts what `left` or `right` accepts: sugar over
 * `union([left, right])`. `left` is tried first, and `right` only when it
 * fails; when both fail, the schema fails with one `InvalidUnion` issue at
 * the root, carrying each branch's issues in order.
 *
 * Chains flatten: a union on either side contributes its own options, so
 * `or({ left: or({ left: a, right: b }), right: c })` tries and fails
 * exactly like `union([a, b, c])`. Both sides get the same input, so the
 * input type is the intersection of theirs, as for `union`.
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
 * import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
 * import { or } from "@sekhmet/schema/algebra/mini";
 * import { entries, formatIssue, parseAsync, parseSync } from "@sekhmet/schema/core/mini";
 * import { boolean, number, string } from "@sekhmet/schema/primitives/mini";
 *
 * const scalar = or({ left: or({ left: string(), right: number() }), right: boolean() });
 *
 * assertEquals(unwrap(parseSync(scalar, true)), true);
 *
 * const [{ error }] = entries(unwrapErr(await parseAsync(scalar, null)));
 * assertEquals(formatIssue(error), "Invalid input: no union branch matched");
 * ```
 */
export function or<I, O, E, J, P, F>(
	options: OrOptions<I, O, E, J, P, F>,
): Schema<I & J, O | P, Issues<SchemaIssue>>;
export function or(options: {
	readonly left: Child;
	readonly right: Child;
}): Schema<unknown, unknown, Issues<SchemaIssue>> {
	return union([...branchesOf(options.left), ...branchesOf(options.right)]);
}
