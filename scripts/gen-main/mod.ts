/**
 * Generates main (method-chaining) entrypoints from mini (functional) barrels.
 *
 * @module
 */

export type { Feature, WrapTarget } from "./src/config.ts";
export { FEATURES } from "./src/config.ts";
export type {
	Declaration,
	Decoded,
	DecodeError,
	DocModules,
	DocSymbol,
	Param,
	Property,
	Resolution,
	TypeNode,
	TypeParam,
} from "./src/doc.ts";
export { decodeDocJson } from "./src/doc.ts";
export { toMethodForm } from "./src/example.ts";
export type {
	Generated,
	GenerateError,
	GenerateInput,
} from "./src/generate.ts";
export { GENERATED_HEADER, generateMain } from "./src/generate.ts";
export type { Result } from "./src/result.ts";
export { isStale } from "./src/stale.ts";
