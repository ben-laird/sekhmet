/**
 * Generates main (method-chaining) entrypoints from mini (functional) barrels.
 *
 * @module
 */

export type {
	ClassFeature,
	Feature,
	FeatureBase,
	FunctionFeature,
	WrapTarget,
} from "./src/config.ts";
export { FEATURES, isClassFeature } from "./src/config.ts";
export type * from "./src/doc.ts";
export { decodeDocJson } from "./src/doc.ts";
export { toMethodForm } from "./src/example.ts";
export type * from "./src/generate.ts";
export { GENERATED_HEADER, generateMain } from "./src/generate.ts";
export type { Result } from "./src/result.ts";
export { isStale } from "./src/stale.ts";
