/**
 * Standard Schema in: {@linkcode fromStandard} wraps any Standard Schema v1
 * (Zod, Valibot, ArkType…) as a `Schema`, and
 * {@linkcode EMPTY_FAILURE_MESSAGE} is the message it reports when one fails
 * without issues.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Issues, type Located } from "@/src/core/mini/issues.ts";
import { isPromiseLike } from "@/src/core/mini/parsing.ts";
import { Schema } from "@/src/core/mini/schema.ts";
import type {
	StandardIssue,
	StandardResult,
	StandardSchemaV1,
} from "./spec.ts";

/**
 * The message of the issue {@linkcode fromStandard} reports when a Standard
 * Schema fails with an empty `issues` list, since `Issues` is never empty.
 */
export const EMPTY_FAILURE_MESSAGE: string = "Validation failed without issues";

/**
 * Wraps any Standard Schema v1 (Zod, Valibot, ArkType…) as a `Schema`, so it
 * composes with `pipe`, `map` and the composites.
 *
 * Each Standard issue becomes an `Issues` entry: its `path` is normalised to
 * `PropertyKey`s (a `{ key }` segment becomes its key, and a missing path is
 * the root), and the issue itself is the entry's error. A `Promise` from
 * `validate` makes the parse asynchronous; any other result keeps it
 * synchronous. `validate` is foreign code, so it runs under the parse's
 * panic boundary: a throw, or a rejection of its promise, settles the parse
 * as `Panicked`.
 *
 * @template O The Standard Schema's output type
 * @param standard The Standard Schema to wrap
 * @returns A schema that validates with `standard`
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
 * import { entries, parse } from "@sekhmet/schema/core/mini";
 * import { fromStandard, type StandardSchemaV1 } from "@sekhmet/schema/standard/mini";
 * import { wait } from "@sekhmet/vow";
 *
 * const text: StandardSchemaV1<unknown, string> = {
 * 	"~standard": {
 * 		version: 1,
 * 		vendor: "example",
 * 		validate: (value) =>
 * 			typeof value === "string"
 * 				? { value }
 * 				: { issues: [{ message: "Expected string", path: [{ key: "name" }] }] },
 * 	},
 * };
 * const schema = fromStandard(text);
 * const panics = definePanicRuntime();
 *
 * assertEquals(unwrap(await wait(parse(schema, { input: "a", panics }))), "a");
 *
 * const [issue] = entries(unwrapErr(await wait(parse(schema, { input: 1, panics }))));
 * assertEquals(issue.path, ["name"]);
 * assertEquals(issue.error.message, "Expected string");
 * ```
 */
export function fromStandard<O>(
	standard: StandardSchemaV1<unknown, O>,
): Schema<unknown, O, Issues<StandardIssue>> {
	return new Schema({
		parse: (input: unknown) => {
			const validated = standard["~standard"].validate(input);
			if (!isPromiseLike(validated)) return toResult(validated);

			return Promise.resolve(validated).then(toResult);
		},
	});
}

/** Converts a Standard result into a `Result`, its issues into `Issues`. */
function toResult<O>(
	result: StandardResult<O>,
): Result<O, Issues<StandardIssue>> {
	if (result.issues === undefined) return Ok(result.value);

	const [first = { message: EMPTY_FAILURE_MESSAGE }, ...rest] = result.issues;

	return Err(new Issues([locate(first), ...rest.map(locate)]));
}

/** Places a Standard issue at its path, normalised to `PropertyKey`s. */
function locate(issue: StandardIssue): Located<StandardIssue> {
	return {
		path: (issue.path ?? []).map((segment) =>
			typeof segment === "object" ? segment.key : segment,
		),
		error: issue,
	};
}
