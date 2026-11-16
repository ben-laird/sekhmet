/**
 * Internal helpers shared by the primitive schemas and their checks. Not part
 * of the public API: the barrel does not re-export this module.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import type { SchemaIssue } from "@/src/core/mini/issue.ts";
import { Schema } from "@/src/core/mini/schema.ts";

/**
 * Inspects a valid value: the issue it fails with, or `undefined` when it
 * passes.
 */
export type Inspect<O> = (output: O) => SchemaIssue | undefined;

/** The first issue `inspections` find in `value`, in order. */
export function firstIssue<O>({
	value,
	inspections,
}: {
	value: O;
	inspections: readonly Inspect<O>[];
}): SchemaIssue | undefined {
	for (const inspect of inspections) {
		const issue = inspect(value);
		if (issue !== undefined) return issue;
	}

	return undefined;
}

/**
 * A leaf schema: `read` turns the input into a value (or rejects it), then
 * each of `inspections` checks the value in order, and the first issue found
 * fails the parse.
 */
export function leaf<O>({
	read,
	inspections,
}: {
	read: (input: unknown) => Result<O, SchemaIssue>;
	inspections: readonly Inspect<O>[];
}): Schema<unknown, O, SchemaIssue> {
	return new Schema({
		parse: (input) => {
			return match(read(input))<Result<O, SchemaIssue>>({
				Ok: (value) => {
					const issue = firstIssue({ value, inspections });

					return issue === undefined ? Ok(value) : Err(issue);
				},
				Err: (issue) => Err(issue),
			});
		},
	});
}

/** The inspection `inspect` builds from `option` when it is set; none otherwise. */
export function when<T, O>({
	option,
	inspect,
}: {
	option: T | undefined;
	inspect: (option: T) => Inspect<O>;
}): Inspect<O>[] {
	return option === undefined ? [] : [inspect(option)];
}
