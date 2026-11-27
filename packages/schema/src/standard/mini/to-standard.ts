/**
 * Standard Schema out: {@linkcode toStandard} exposes a schema as a Standard
 * Schema v1, for tools that accept one, with its {@linkcode ToStandardSchema}
 * and {@linkcode ToStandardOptions}.
 *
 * @module
 */

import { match } from "@sekhmet/enum/core/mini/exit";
import { expectReady } from "@sekhmet/enum/poll/mini";
import type { PanicBoundary } from "@sekhmet/panic/mini/runtime";
import type { Outcome } from "@sekhmet/panic/outcome/mini/core";
import { poll } from "@sekhmet/vow/mini/accessors";
import { wait } from "@sekhmet/vow/mini/impl";
import {
	formatIssue,
	isSchemaIssue,
	type SchemaIssue,
} from "@/src/core/mini/issue.ts";
import {
	entries,
	type Flatten,
	type Issues,
	toIssues,
} from "@/src/core/mini/issues.ts";
import { parse, type Schema } from "@/src/core/mini/schema.ts";
import type {
	StandardIssue,
	StandardResult,
	StandardSchemaV1,
} from "./spec.ts";

/**
 * What {@linkcode toStandard} exposes: a schema whose input is `unknown`,
 * and whose errors are all `SchemaIssue`s, with the panic runtime its
 * parses run under.
 *
 * @template O The schema's output type
 */
export interface ToStandardSchema<O> {
	/** The schema to expose. */
	readonly schema: Schema<unknown, O, SchemaIssue | Issues<SchemaIssue>>;
	/**
	 * The panic boundary each parse runs under: pass the program's panic
	 * runtime. A panic is reported to its hook, then resumed: `validate`
	 * throws (or its promise rejects with) the payload.
	 */
	readonly panics: PanicBoundary;
}

/**
 * What {@linkcode toStandard} exposes when the schema's errors are not all
 * `SchemaIssue`s: the schema, and how to report each error.
 *
 * @template O The schema's output type
 * @template E The schema's error type
 */
export interface ToStandardOptions<O, E> {
	/** The schema to expose. */
	readonly schema: Schema<unknown, O, E>;
	/**
	 * The panic boundary each parse runs under: pass the program's panic
	 * runtime. A panic is reported to its hook, then resumed: `validate`
	 * throws (or its promise rejects with) the payload.
	 */
	readonly panics: PanicBoundary;
	/**
	 * Turns one error into a Standard issue: a message, or a message and a
	 * path. An `Issues` error is converted entry by entry, and each entry's
	 * path is prepended to the path `toIssue` returns.
	 */
	readonly toIssue: (error: Flatten<E>) => string | StandardIssue;
}

/**
 * Exposes a schema as a Standard Schema v1, for tools that accept one.
 *
 * The schema's input must be `unknown`, as Standard Schema's `validate` takes
 * any value. `validate` returns its result synchronously when the parse
 * settled synchronously, and a `Promise` (through `wait`) otherwise. A
 * panic in the parse, or in `toIssue`, is reported to `panics`' hook and
 * resumed: `validate` throws the payload, or its promise rejects with it. A `SchemaIssue` error becomes
 * one Standard issue with `formatIssue`'s message, and an
 * `Issues<SchemaIssue>` one issue per entry, with the entry's path. Any other
 * error needs a `toIssue` option, and the types require it.
 *
 * @template O The schema's output type
 * @param options The schema to expose, and the panic runtime it parses
 *   under
 * @returns A Standard Schema that validates with the schema
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { InvalidType, Schema } from "@sekhmet/schema/core/mini";
 * import { toStandard } from "@sekhmet/schema/standard/mini";
 *
 * const text = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "string" ? Ok(input) : Err(InvalidType({ input, expected: "string" }));
 * 	},
 * });
 * const standard = toStandard({ schema: text, panics: definePanicRuntime() });
 *
 * assertEquals(standard["~standard"].validate("a"), { value: "a" });
 * assertEquals(standard["~standard"].validate(1), {
 * 	issues: [{ message: "Expected string, received number" }],
 * });
 * ```
 */
export function toStandard<O>(
	options: ToStandardSchema<O>,
): StandardSchemaV1<unknown, O>;
/**
 * Exposes a schema whose errors are not all `SchemaIssue`s as a Standard
 * Schema v1, converting each error with `toIssue`.
 *
 * @template O The schema's output type
 * @template E The schema's error type
 * @param options The schema to expose, the panic runtime it parses under,
 *   and how to turn each error into a Standard issue
 * @returns A Standard Schema that validates with the schema
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Err, Ok } from "@sekhmet/enum/result/mini";
 * import { definePanicRuntime } from "@sekhmet/panic";
 * import { Schema } from "@sekhmet/schema/core/mini";
 * import { toStandard } from "@sekhmet/schema/standard/mini";
 *
 * const even = new Schema({
 * 	parse: (input: unknown) => {
 * 		return typeof input === "number" && input % 2 === 0 ? Ok(input) : Err({ code: "odd" });
 * 	},
 * });
 * const standard = toStandard({
 * 	schema: even,
 * 	panics: definePanicRuntime(),
 * 	toIssue: ({ code }) => `Rejected: ${code}`,
 * });
 *
 * assertEquals(standard["~standard"].validate(3), {
 * 	issues: [{ message: "Rejected: odd" }],
 * });
 * ```
 */
export function toStandard<O, E>(
	options: ToStandardOptions<O, E>,
): StandardSchemaV1<unknown, O>;
export function toStandard<O, E>(options: {
	readonly schema: Schema<unknown, O, E>;
	readonly panics: PanicBoundary;
	readonly toIssue?: (error: Flatten<E>) => string | StandardIssue;
}): StandardSchemaV1<unknown, O> {
	const { schema, panics } = options;
	const toIssue = options.toIssue ?? formatSchemaIssue;
	const issuesOf = (error: E): StandardResult<O> => {
		return {
			issues: entries(toIssues(error)).map(({ path, error }) => {
				return locateIssue({ path, issue: toIssue(error) });
			}),
		};
	};
	const toStandardResult = (
		outcome: Outcome<O, E, unknown>,
	): StandardResult<O> => {
		return match(outcome)<StandardResult<O>>({
			Ok: (value) => ({ value }),
			Err: (error) => {
				// toIssue is user code: a throw is a panic, reported, then resumed
				const caught = panics.catchUnwind(() => issuesOf(error));
				const converted = expectReady(poll(caught), "issuesOf is sync");

				return match(converted)<StandardResult<O>>({
					Ok: (result) => result,
					Err: (impossible) => impossible,
					Panicked: (payload) => panics.resumeUnwind(payload),
				});
			},
			Panicked: (payload) => panics.resumeUnwind(payload),
		});
	};

	return {
		"~standard": {
			version: 1,
			vendor: "sekhmet",
			validate: (value) => {
				const parsing = parse(schema, { input: value, panics });

				return match(parsing)<StandardResult<O> | Promise<StandardResult<O>>>({
					Pending: () => wait(parsing).then(toStandardResult),
					Resolved: toStandardResult,
				});
			},
		},
	};
}

/**
 * The default `toIssue`: the overloads only allow it for `SchemaIssue`
 * errors, so any other error means they were bypassed.
 */
function formatSchemaIssue(error: unknown): string {
	if (isSchemaIssue(error)) return formatIssue(error);

	throw new TypeError(
		"toStandard: an error that is not a SchemaIssue needs a toIssue option",
	);
}

/** Prepends an `Issues` entry's path to a converted issue's own path. */
function locateIssue({
	path,
	issue,
}: {
	path: readonly PropertyKey[];
	issue: string | StandardIssue;
}): StandardIssue {
	const { message, path: own = [] } =
		typeof issue === "string" ? { message: issue } : issue;
	const located = [...path, ...own];

	return located.length === 0 ? { message } : { message, path: located };
}
