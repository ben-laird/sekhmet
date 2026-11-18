/**
 * Tree-shakable Standard Schema adapter: {@linkcode toStandard} exposes a
 * schema as a Standard Schema v1, and {@linkcode fromStandard} wraps any
 * Standard Schema as a schema.
 *
 * @module
 */

export { EMPTY_FAILURE_MESSAGE, fromStandard } from "./from-standard.ts";
export type {
	InferStandardInput,
	InferStandardOutput,
	StandardFailureResult,
	StandardIssue,
	StandardPathSegment,
	StandardResult,
	StandardSchemaV1,
	StandardSchemaV1Props,
	StandardSuccessResult,
	StandardTypes,
	StandardValidateOptions,
} from "./spec.ts";
export {
	type ToStandardOptions,
	type ToStandardSchema,
	toStandard,
} from "./to-standard.ts";
