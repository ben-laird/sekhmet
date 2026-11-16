/**
 * The Standard Schema v1 interface, declared locally so the package has no
 * external dependency (the spec invites copying its types).
 *
 * Copied from `@standard-schema/spec` 1.1.0
 * (https://github.com/standard-schema/standard-schema, https://standardschema.dev),
 * flattened from its `StandardSchemaV1` namespace into prefixed names. The
 * `StandardTypedV1` base is folded into {@linkcode StandardSchemaV1Props}, and
 * the `StandardJSONSchemaV1` extension is left out.
 *
 * @module
 */

/**
 * A Standard Schema: any value with a `~standard` property. Zod, Valibot,
 * ArkType and other libraries implement it, and so does the result of
 * `toStandard`.
 *
 * @template Input The input type the schema declares
 * @template Output The output type a successful validation yields
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import type { StandardSchemaV1 } from "@sekhmet/schema/standard/mini";
 *
 * const text: StandardSchemaV1<unknown, string> = {
 * 	"~standard": {
 * 		version: 1,
 * 		vendor: "example",
 * 		validate: (value) =>
 * 			typeof value === "string"
 * 				? { value }
 * 				: { issues: [{ message: "Expected string" }] },
 * 	},
 * };
 *
 * assertEquals(text["~standard"].validate("a"), { value: "a" });
 * ```
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	/** The Standard Schema properties. */
	readonly "~standard": StandardSchemaV1Props<Input, Output>;
}

/**
 * The properties under a Standard Schema's `~standard` key.
 *
 * @template Input The input type the schema declares
 * @template Output The output type a successful validation yields
 */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
	/** The version number of the standard. */
	readonly version: 1;
	/** The vendor name of the schema library. */
	readonly vendor: string;
	/** Validates unknown input values. */
	readonly validate: (
		value: unknown,
		options?: StandardValidateOptions | undefined,
	) => StandardResult<Output> | Promise<StandardResult<Output>>;
	/** Inferred types associated with the schema; for type inference only. */
	readonly types?: StandardTypes<Input, Output> | undefined;
}

/** The options a caller may pass to a Standard Schema's `validate`. */
export interface StandardValidateOptions {
	/** Explicit support for additional vendor-specific parameters, if needed. */
	readonly libraryOptions?: Record<string, unknown> | undefined;
}

/**
 * The result of a Standard Schema's `validate`.
 *
 * @template Output The output type a successful validation yields
 */
export type StandardResult<Output> =
	| StandardSuccessResult<Output>
	| StandardFailureResult;

/**
 * The result of a successful validation.
 *
 * @template Output The output type
 */
export interface StandardSuccessResult<Output> {
	/** The typed output value. */
	readonly value: Output;
	/** A falsy value for `issues` indicates success. */
	readonly issues?: undefined;
}

/** The result of a failed validation. */
export interface StandardFailureResult {
	/** The issues of failed validation. */
	readonly issues: readonly StandardIssue[];
}

/**
 * One issue of a failed Standard Schema validation.
 *
 * @example
 * ```ts
 * import type { StandardIssue } from "@sekhmet/schema/standard/mini";
 *
 * const issue: StandardIssue = {
 * 	message: "Expected string",
 * 	path: ["user", { key: "name" }],
 * };
 * ```
 */
export interface StandardIssue {
	/** The error message of the issue. */
	readonly message: string;
	/** The path of the issue, if any. */
	readonly path?: readonly (PropertyKey | StandardPathSegment)[] | undefined;
}

/** A path segment of a {@linkcode StandardIssue}, as an object. */
export interface StandardPathSegment {
	/** The key representing a path segment. */
	readonly key: PropertyKey;
}

/**
 * The input and output types a Standard Schema declares.
 *
 * @template Input The input type
 * @template Output The output type
 */
export interface StandardTypes<Input = unknown, Output = Input> {
	/** The input type of the schema. */
	readonly input: Input;
	/** The output type of the schema. */
	readonly output: Output;
}

/**
 * The input type a Standard Schema declares.
 *
 * @template S The Standard Schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { InferStandardInput, StandardSchemaV1 } from "@sekhmet/schema/standard/mini";
 *
 * assertType<IsExact<InferStandardInput<StandardSchemaV1<string, number>>, string>>(true);
 * ```
 */
export type InferStandardInput<S extends StandardSchemaV1> = NonNullable<
	S["~standard"]["types"]
>["input"];

/**
 * The output type a Standard Schema declares.
 *
 * @template S The Standard Schema
 *
 * @example
 * ```ts
 * import { assertType, type IsExact } from "@std/testing/types";
 * import type { InferStandardOutput, StandardSchemaV1 } from "@sekhmet/schema/standard/mini";
 *
 * assertType<IsExact<InferStandardOutput<StandardSchemaV1<string, number>>, number>>(true);
 * ```
 */
export type InferStandardOutput<S extends StandardSchemaV1> = NonNullable<
	S["~standard"]["types"]
>["output"];
