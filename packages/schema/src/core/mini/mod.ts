/**
 * Tree-shakable core schema utilities.
 *
 * This module provides granular exports for the schema core functionality,
 * including the Potential type for async/sync handling and the Schema type
 * with all its manipulation functions.
 *
 * @module
 */

export {
	Async,
	from,
	map,
	type MaybePromise,
	type Potential,
	type PotentialVariants,
	Sync,
} from "./potential.ts";

export {
	filter,
	map as mapSchema,
	mapErr,
	parse,
	parseAsync,
	ParseError,
	type ParseSyncError,
	type ParseSyncErrorVariants,
	parseSync,
	type Parser,
	pipe,
	type Schema,
	UnexpectedAsyncParse,
} from "./schema.ts";
