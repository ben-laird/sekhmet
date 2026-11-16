/**
 * Internal helpers shared by the primitive schemas and their checks. Not part
 * of the public API: the barrel does not re-export this module.
 *
 * @module
 */

import { match, union } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import { map as mapPotential } from "@/src/core/mini/potential.ts";
import { parse, Schema } from "@/src/core/mini/schema.ts";

/**
 * Inspects a valid output: the issue it fails with, or `undefined` when it
 * passes.
 */
export type Inspect<O> = (output: O) => SchemaIssue | undefined;

/**
 * A schema that runs `self`, then fails a valid output with the issue
 * `inspect` finds. A failure of `self` is passed through unchanged.
 */
export function check<I, O, E>(
	self: Schema<I, O, E>,
	inspect: Inspect<O>,
): Schema<I, O, E | SchemaIssue> {
	return new Schema((input) =>
		union(
			mapPotential(parse(self, input), (result) => verdict(result, inspect)),
		),
	);
}

function verdict<O, E>(
	result: Result<O, E>,
	inspect: Inspect<O>,
): Result<O, E | SchemaIssue> {
	return match(result)<Result<O, E | SchemaIssue>>({
		Ok: (output) => {
			const issue = inspect(output);

			return issue === undefined ? Ok(output) : Err(issue);
		},
		Err: (error) => Err(error),
	});
}

/**
 * A schema from a leaf parser over `unknown`: the output, or the issue that
 * rejects the input.
 */
export function leaf<O>(
	parseInput: (input: unknown) => Result<O, SchemaIssue>,
): Schema<unknown, O, SchemaIssue> {
	return new Schema(parseInput);
}
