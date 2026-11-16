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
	type MaybePromise,
	map,
	type Potential,
	type PotentialVariants,
	Sync,
} from "./potential.ts";

export {
	filter,
	map as mapSchema,
	mapErr,
	ParseError,
	type Parser,
	type ParseSyncError,
	type ParseSyncErrorVariants,
	parse,
	parseAsync,
	parseSync,
	pipe,
	type Schema,
	UnexpectedAsyncParse,
} from "./schema.ts";
